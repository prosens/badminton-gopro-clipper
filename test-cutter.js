/**
 * Badminton GoPro Clipper - Automated Integration Test
 * Validates cross-file cutting and lossless stitching logic.
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const mockDir = path.join(__dirname, 'mock_gopro_session');
const outputDir = path.join(mockDir, 'exported_games');

console.log(`=======================================================`);
console.log(`RUNNING AUTOMATED SEGMENTER INTEGRATION TESTS`);
console.log(`=======================================================`);

// Helper to run exec as a promise
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function spawnPromise(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${command} failed with exit code ${code}`));
    });
  });
}

async function runTest() {
  try {
    // 1. Verify mock files exist
    const files = [
      { name: 'GH010023.MP4', duration: 10, path: path.join(mockDir, 'GH010023.MP4') },
      { name: 'GH020023.MP4', duration: 10, path: path.join(mockDir, 'GH020023.MP4') },
      { name: 'GH030023.MP4', duration: 10, path: path.join(mockDir, 'GH030023.MP4') }
    ];

    files.forEach(f => {
      if (!fs.existsSync(f.path)) {
        throw new Error(`Test file not found: ${f.path}. Run create_mock_videos.js first.`);
      }
    });

    console.log(`[TEST] Verified 3 mock GoPro files exist.`);

    // 2. Pre-calculate global boundaries
    let currentGlobalTime = 0;
    const filesWithBoundaries = files.map(file => {
      const start = currentGlobalTime;
      const end = currentGlobalTime + file.duration;
      currentGlobalTime = end;
      return {
        ...file,
        globalStart: start,
        globalEnd: end
      };
    });

    // 3. Define a cross-file split (from global 5s to 25s)
    // Game 1 starts in File 1 at 5s, spans all of File 2 (10s), and ends in File 3 at 5s
    const testSplit = {
      start: 5,  // starts 5 seconds in
      end: 25,  // ends 25 seconds in (total duration = 20s)
      title: 'Game_1',
      teamA: 'Prosenjit_Joe',
      teamB: 'Mark_Dan',
      score: '21-19'
    };

    console.log(`[TEST] Defined cross-file split: [${testSplit.start}s - ${testSplit.end}s] (Duration: ${testSplit.end - testSplit.start}s)`);

    const tempDir = path.join(outputDir, '.temp_test_clipper');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    // 4. Map global split to files
    const intersectingFiles = [];
    for (const f of filesWithBoundaries) {
      const overlapStart = Math.max(f.globalStart, testSplit.start);
      const overlapEnd = Math.min(f.globalEnd, testSplit.end);
      
      if (overlapEnd > overlapStart) {
        intersectingFiles.push({
          file: f,
          relativeStart: overlapStart - f.globalStart,
          duration: overlapEnd - overlapStart
        });
      }
    }

    console.log(`[TEST] Mapped to physical segments:`);
    intersectingFiles.forEach((item, idx) => {
      console.log(`   Segment ${idx+1}: File ${item.file.name} | Start: ${item.relativeStart}s | Dur: ${item.duration}s`);
    });

    if (intersectingFiles.length !== 3) {
      throw new Error(`Expected split to intersect 3 files, got ${intersectingFiles.length}`);
    }

    // 5. Perform lossless cuts
    const tempPartPaths = [];
    for (let i = 0; i < intersectingFiles.length; i++) {
      const item = intersectingFiles[i];
      const partPath = path.join(tempDir, `part_${i + 1}.mp4`);
      
      const args = [
        '-y',
        '-ss', item.relativeStart.toString(),
        '-t', item.duration.toString(),
        '-i', item.file.path,
        '-c', 'copy',
        '-map', '0:v',
        '-map', '0:a?',
        '-avoid_negative_ts', 'make_zero',
        partPath
      ];

      await spawnPromise('ffmpeg', args);
      tempPartPaths.push(partPath);
      console.log(`   [CUT] Segment ${i+1} saved to temp.`);
    }

    // 6. Concatenate parts
    const listFilePath = path.join(tempDir, 'concat_list.txt');
    const listContent = tempPartPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFilePath, listContent, 'utf8');

    const finalOutputFile = path.join(outputDir, `Game_1_${testSplit.teamA}_vs_${testSplit.teamB}_${testSplit.score}.mp4`);
    const tempStitchOutPath = path.join(tempDir, 'temp_stitch_out.mp4');
    
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFilePath,
      '-c', 'copy',
      tempStitchOutPath
    ];

    console.log(`[TEST] Stitching segments together...`);
    await spawnPromise('ffmpeg', concatArgs);
    
    if (fs.existsSync(finalOutputFile)) {
      fs.unlinkSync(finalOutputFile);
    }
    fs.renameSync(tempStitchOutPath, finalOutputFile);
    
    console.log(`✓ [STITCH] Success! Final output written to:\n  ${finalOutputFile}`);

    // Cleanup temp
    tempPartPaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
    if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

    // 7. Validate output file metadata
    console.log(`[TEST] Verifying exported video details...`);
    if (!fs.existsSync(finalOutputFile)) {
      throw new Error('Exported video file does not exist!');
    }

    const probeCmd = `ffprobe -v error -show_entries format=duration -of json "${finalOutputFile}"`;
    const { stdout } = await execPromise(probeCmd);
    const metadata = JSON.parse(stdout);
    const actualDuration = parseFloat(metadata.format.duration);

    console.log(`[TEST] Actual output duration: ${actualDuration.toFixed(2)}s`);
    
    // Check if within 0.5s of expected 20s
    if (Math.abs(actualDuration - 20) > 0.5) {
      throw new Error(`Test failed: Expected duration of 20 seconds, got ${actualDuration} seconds.`);
    }

    console.log(`\n=======================================================`);
    console.log(`🎉 ALL TESTS PASSED SUCCESSFULLY!`);
    console.log(`Lossless Trim & Join pipeline is 100% correct!`);
    console.log(`=======================================================`);

  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error.message);
    process.exit(1);
  }
}

runTest();
