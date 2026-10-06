/**
 * Badminton GoPro Clipper V2 - Offline Motion Analyzer
 * Uses FFmpeg to extract a low-resolution grayscale video stream on stdout
 * and calculates pixel differences to segment matches offline without external libraries.
 */

const { spawn } = require('child_process');

const OPTIMIZATION_CONFIG = {
  enableParallelScanning: true,  // Analyze multiple GoPro files concurrently
  enableHardwareAccel: true,     // Use 'videotoolbox' Apple Silicon decoding
  useNearestNeighborScale: true  // Use fast neighbor flags for FFmpeg scaling
};

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Run pixel difference analysis on a single video file.
 * We extract frames at 1 frame per 2 seconds, downscaled to 160x90 grayscale.
 * Returns an array of samples containing: { time, left, right, total }
 */
function analyzeFile(filePath, duration, offsetSeconds, sampleInterval = 2, crop = null, onProgress = () => {}) {
  return new Promise((resolve) => {
    const width = 160;
    const height = 90;
    const frameSize = width * height;

    // Define court bounds based on manual calibration or fallbacks
    const xStartPct = (crop && crop.xStart !== undefined) ? crop.xStart / 100 : 0.15;
    const xEndPct = (crop && crop.xEnd !== undefined) ? crop.xEnd / 100 : 0.85;
    const yStartPct = (crop && crop.yStart !== undefined) ? crop.yStart / 100 : 0.20;
    const yEndPct = (crop && crop.yEnd !== undefined) ? crop.yEnd / 100 : 0.90;

    const cropXStart = Math.floor(width * xStartPct);
    const cropXEnd = Math.floor(width * xEndPct);
    const cropYStart = Math.floor(height * yStartPct);
    const cropYEnd = Math.floor(height * yEndPct);

    const midX = Math.floor(width * 0.50); // 80

    const args = [];
    if (OPTIMIZATION_CONFIG.enableHardwareAccel) {
      args.push('-hwaccel', 'videotoolbox');
    }
    args.push('-skip_frame', 'nokey');
    args.push('-v', 'error');
    args.push('-i', filePath);

    const scaleFlags = OPTIMIZATION_CONFIG.useNearestNeighborScale ? ':flags=neighbor' : '';
    args.push('-vf', `fps=1/${sampleInterval},scale=${width}:${height}${scaleFlags},format=gray`);
    args.push('-f', 'rawvideo', '-');

    const proc = spawn('ffmpeg', args);
    let buffer = Buffer.alloc(0);
    let prevFrame = null;
    const samples = [];
    let frameIndex = 0;

    proc.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= frameSize) {
        const currFrame = buffer.subarray(0, frameSize);
        const timeSec = offsetSeconds + frameIndex * sampleInterval;

        if (prevFrame) {
          let leftActiveCount = 0;
          let leftCount = 0;
          let rightActiveCount = 0;
          let rightCount = 0;
          let totalActiveCount = 0;
          let totalCount = 0;

          for (let y = cropYStart; y < cropYEnd; y++) {
            const rowOffset = y * width;
            for (let x = cropXStart; x < cropXEnd; x++) {
              const idx = rowOffset + x;
              const diff = Math.abs(currFrame[idx] - prevFrame[idx]);

              totalCount++;
              if (diff > 12) { // filter noise, count active pixels
                totalActiveCount++;
              }

              if (x < midX) {
                leftCount++;
                if (diff > 12) leftActiveCount++;
              } else {
                rightCount++;
                if (diff > 12) rightActiveCount++;
              }
            }
          }

          // Express motion as percentage of active pixels (0% to 100%)
          const leftMotion = leftCount > 0 ? (leftActiveCount / leftCount) * 100 : 0;
          const rightMotion = rightCount > 0 ? (rightActiveCount / rightCount) * 100 : 0;
          const totalMotion = totalCount > 0 ? (totalActiveCount / totalCount) * 100 : 0;

          samples.push({
            time: Math.min(timeSec, offsetSeconds + duration),
            left: parseFloat(leftMotion.toFixed(2)),
            right: parseFloat(rightMotion.toFixed(2)),
            total: parseFloat(totalMotion.toFixed(2))
          });
        } else {
          // First frame baseline
          samples.push({
            time: timeSec,
            left: 0,
            right: 0,
            total: 0
          });
        }

        prevFrame = Buffer.from(currFrame);
        buffer = buffer.subarray(frameSize);
        frameIndex++;

        // Report progress every 15 frames
        if (frameIndex % 15 === 0) {
          const pct = Math.min(((frameIndex * sampleInterval) / duration) * 100, 100);
          onProgress(parseFloat(pct.toFixed(0)));
        }
      }
    });

    proc.stderr.on('data', (data) => {
      // Quiet suppress
    });

    proc.on('close', (code) => {
      // In case video ended shorter than expected, fill end
      if (samples.length === 0) {
        samples.push({ time: offsetSeconds, left: 0, right: 0, total: 0 });
      }
      resolve(samples);
    });

    proc.on('error', (err) => {
      console.error(`[Motion Analyzer] FFmpeg error on ${filePath}:`, err.message);
      resolve(samples);
    });
  });
}

/**
 * Smooth signal using moving average
 */
function movingAverage(samples, windowSize) {
  const smoothed = [];
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(samples.length - 1, i + Math.floor(windowSize / 2));
    for (let j = start; j <= end; j++) {
      sum += samples[j].total;
      count++;
    }
    smoothed.push(parseFloat((sum / count).toFixed(2)));
  }
  return smoothed;
}

/**
 * Main function to scan a full GoPro session sequentially
 */
async function analyzeSession(files, sampleInterval = 2, crop = null, onProgress = () => {}) {
  const allSamples = [];

  if (OPTIMIZATION_CONFIG.enableParallelScanning) {
    onProgress({ status: 'info', message: `🚀 Initialized parallel motion analyzer session across ${files.length} file(s).` });
    
    let currentOffset = 0;
    const promises = files.map((file, i) => {
      const fileOffset = currentOffset;
      currentOffset += file.duration;
      
      onProgress({ status: 'info', message: `🔍 Starting parallel analysis on file: ${file.name}...` });
      
      return analyzeFile(file.path, file.duration, fileOffset, sampleInterval, crop, (progressVal) => {
        onProgress({
          status: 'progress',
          file: file.name,
          percent: progressVal
        });
      });
    });

    const results = await Promise.all(promises);
    results.forEach(fileSamples => {
      allSamples.push(...fileSamples);
    });
  } else {
    let globalOffset = 0;
    onProgress({ status: 'info', message: `🚀 Initialized sequential motion analyzer session across ${files.length} file(s).` });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress({ status: 'info', message: `🔍 Processing file ${i + 1}/${files.length}: ${file.name}...` });

      const fileSamples = await analyzeFile(file.path, file.duration, globalOffset, sampleInterval, crop, (progressVal) => {
        onProgress({
          status: 'progress',
          file: file.name,
          percent: progressVal
        });
      });
      allSamples.push(...fileSamples);
      globalOffset += file.duration;
    }
  }

  if (allSamples.length === 0) {
    return { proposedGames: [], samples: [] };
  }

  onProgress({ status: 'info', message: '📈 Smoothing motion curve signals (60s low-pass filter)...' });

  // Smooth the signal: 60-second window
  const windowSize = Math.floor(60 / sampleInterval);
  const smoothedScores = movingAverage(allSamples, windowSize);

  // Compute dynamic threshold (midpoint between 15th and 85th percentiles)
  const sorted = [...smoothedScores].sort((a, b) => a - b);
  const p15 = sorted[Math.floor(sorted.length * 0.15)] || 0.5;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] || 4.0;
  // Compute dynamic threshold (midpoint) but enforce a sensible floor of 1.0% active pixels
  const threshold = Math.max(parseFloat(((p15 + p85) / 2).toFixed(2)), 1.0);

  onProgress({ status: 'info', message: `🎯 Dynamic activity threshold: ${threshold}% active pixels.` });

  // Determine active/break states
  const states = smoothedScores.map(val => val >= threshold);

  // Find continuous break intervals
  const breaks = [];
  let inBreak = false;
  let breakStart = 0;

  for (let i = 0; i < states.length; i++) {
    const time = allSamples[i].time;
    if (!states[i]) {
      if (!inBreak) {
        inBreak = true;
        breakStart = time;
      }
    } else {
      if (inBreak) {
        inBreak = false;
        const breakEnd = time;
        // Keep breaks that are longer than 45 seconds (allows standard badminton intervals/court switches)
        if (breakEnd - breakStart >= 45) {
          breaks.push({ start: breakStart, end: breakEnd });
        }
      }
    }
  }

  if (inBreak) {
    const breakEnd = allSamples[allSamples.length - 1].time;
    if (breakEnd - breakStart >= 45) {
      breaks.push({ start: breakStart, end: breakEnd });
    }
  }

  // Segment session based on break intervals
  const totalDuration = allSamples[allSamples.length - 1].time;
  const proposedGames = [];
  let lastGameEnd = 0;

  for (let i = 0; i < breaks.length; i++) {
    const brk = breaks[i];

    // Game is from lastGameEnd to brk.start
    // Minimum badminton game duration is usually around 5 minutes (300 seconds)
    if (brk.start - lastGameEnd >= 300) {
      proposedGames.push({
        start: Math.round(lastGameEnd),
        end: Math.round(brk.start)
      });
    }
    lastGameEnd = brk.end;
  }

  // Check for a final game
  if (totalDuration - lastGameEnd >= 300) {
    proposedGames.push({
      start: Math.round(lastGameEnd),
      end: Math.round(totalDuration)
    });
  }

  // Print results summary
  if (proposedGames.length > 0) {
    onProgress({ status: 'info', message: `✅ Auto-detected ${proposedGames.length} game(s):` });
    proposedGames.forEach((game, idx) => {
      onProgress({
        status: 'info',
        message: `   • Game ${idx + 1}: ${formatTime(game.start)} ➔ ${formatTime(game.end)} (Duration: ${formatTime(game.end - game.start)})`
      });
    });
  } else {
    onProgress({ status: 'info', message: '⚠️ No badminton matches longer than 5 minutes detected.' });
  }

  // Match the samples and smoothed scores into unified payload
  const resultSamples = allSamples.map((sample, idx) => ({
    time: sample.time,
    motion: sample.total,
    smoothed: smoothedScores[idx],
    left: sample.left,
    right: sample.right
  }));

  return {
    proposedGames,
    threshold,
    samples: resultSamples
  };
}

module.exports = {
  analyzeSession
};
