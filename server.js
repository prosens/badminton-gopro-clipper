const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');

// Load Google Cloud developer credentials from gitignored config
let DEFAULT_CLIENT_ID = '';
let DEFAULT_CLIENT_SECRET = '';
try {
  const credPath = path.join(__dirname, 'google_credentials.json');
  if (fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    DEFAULT_CLIENT_ID = creds.clientId || '';
    DEFAULT_CLIENT_SECRET = creds.clientSecret || '';
  }
} catch (err) {
  console.error('Failed to load local Google credentials:', err.message);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper to run exec as a promise
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Function to escape filepath for shell execution
function shellEscape(filepath) {
  return `'${filepath.replace(/'/g, "'\\''")}'`;
}

// Sanitize filename to be OS safe
function sanitizeFilename(name, fallback = '') {
  if (!name) return fallback;
  return name
    .replace(/[\/\\]/g, '-') // Replace slashes / and \ with a dash -
    .replace(/[^a-zA-Z0-9_\-\s\(\)]/g, '') // Keep letters, numbers, spaces, dashes, underscores, and ()
    .trim();
}

/**
 * Endpoint to list subdirectories of a given path for the in-app file browser
 */
app.get('/api/list-dirs', (req, res) => {
  let targetDir = req.query.path;
  
  if (!targetDir) {
    targetDir = os.homedir();
  }

  try {
    const resolvedPath = path.resolve(targetDir);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const items = fs.readdirSync(resolvedPath);
    const subfolders = [];

    for (const item of items) {
      if (item.startsWith('.')) continue; // hide hidden folders
      
      const fullPath = path.join(resolvedPath, item);
      try {
        const itemStat = fs.statSync(fullPath);
        if (itemStat.isDirectory()) {
          subfolders.push({
            name: item,
            path: fullPath
          });
        }
      } catch (e) {
        // Skip unreadable files/folders
      }
    }

    // Sort folders alphabetically
    subfolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    res.json({
      current: resolvedPath,
      parent: resolvedPath === '/' || resolvedPath === path.parse(resolvedPath).root ? null : path.dirname(resolvedPath),
      folders: subfolders
    });

  } catch (err) {
    console.error('Error listing directories:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint to browse for a local folder using native macOS folder selector
 */
app.get('/api/browse', (req, res) => {
  const script = `osascript -e 'POSIX path of (choose folder with prompt "Select your GoPro videos folder:")'`;
  
  exec(script, (error, stdout, stderr) => {
    if (error) {
      if (error.message.includes('-128')) {
        return res.json({ cancelled: true });
      }
      return res.status(500).json({ error: error.message });
    }
    
    const selectedPath = stdout.trim();
    res.json({ cancelled: false, path: selectedPath });
  });
});

/**
 * Endpoint to scan a folder for video files
 */
app.post('/api/scan', async (req, res) => {
  const { dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  try {
    const resolvedPath = path.resolve(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Directory does not exist: ${resolvedPath}` });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Read all files in the directory
    const files = fs.readdirSync(resolvedPath);
    const videoExtensions = ['.mp4', '.mov', '.m4v', '.3gp'];
    const videoFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return videoExtensions.includes(ext) && !file.startsWith('.');
    });

    console.log(`Found ${videoFiles.length} potential video files in ${resolvedPath}`);

    const fileDetails = [];

    // Extract metadata using ffprobe for each file
    for (const file of videoFiles) {
      const fullPath = path.join(resolvedPath, file);
      const fileStat = fs.statSync(fullPath);

      let duration = 0;
      let width = 0;
      let height = 0;
      let codec = 'unknown';
      let creationTime = null;

      try {
        const cmd = `ffprobe -v error -select_streams v:0 -show_entries format=duration:stream=codec_name,width,height:format_tags=creation_time -of json ${shellEscape(fullPath)}`;
        const { stdout } = await execPromise(cmd);
        const metadata = JSON.parse(stdout);

        if (metadata.format && metadata.format.duration) {
          duration = parseFloat(metadata.format.duration);
        }
        if (metadata.streams && metadata.streams[0]) {
          const stream = metadata.streams[0];
          width = stream.width || 0;
          height = stream.height || 0;
          codec = stream.codec_name || 'unknown';
        }
        if (metadata.format && metadata.format.tags && metadata.format.tags.creation_time) {
          creationTime = new Date(metadata.format.tags.creation_time);
        }
      } catch (err) {
        console.error(`Error probing file ${file}:`, err.message);
        // Fallback: estimate duration from file size if needed, or leave at 0
      }

      // If ffprobe failed to get creation time, fallback to file system birthtime/mtime
      if (!creationTime || isNaN(creationTime.getTime())) {
        creationTime = fileStat.birthtime && fileStat.birthtime.getTime() > 0 ? fileStat.birthtime : fileStat.mtime;
      }

      fileDetails.push({
        name: file,
        path: fullPath,
        size: fileStat.size,
        duration: duration, // in seconds
        width,
        height,
        codec,
        creationTime: creationTime.toISOString(),
        createdMs: creationTime.getTime()
      });
    }

    // Sort files chronologically. 
    // GoPro chapters preserve order. GoPro name format: GH010001.MP4, GH020001.MP4, etc.
    // If files are created in the same session, sorting by name is extremely reliable for GoPro chapters.
    // We will do a hybrid sort: first sort alphabetically by filename (since GoPro sequencing GH01xxxx, GH02xxxx is natural),
    // and then group them if there are different recordings. Or we can just sort by creationTime.
    // Let's sort by creationTime as primary, and filename as secondary.
    fileDetails.sort((a, b) => {
      // If creation time is different by more than 2 seconds, use creation time
      if (Math.abs(a.createdMs - b.createdMs) > 2000) {
        return a.createdMs - b.createdMs;
      }
      // Otherwise fallback to filename alphabetical sorting
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Check if there is an existing project session file
    const projectFilePath = path.join(resolvedPath, 'badminton_session.json');
    let projectSession = null;
    if (fs.existsSync(projectFilePath)) {
      try {
        const fileContent = fs.readFileSync(projectFilePath, 'utf8');
        projectSession = JSON.parse(fileContent);

        // Self-heal and auto-detect existing video files on disk
        const outputDir = path.join(resolvedPath, 'exported_games');
        if (projectSession && projectSession.splits) {
          let mutated = false;
          projectSession.splits.forEach(split => {
            // Ensure properties exist
            if (!split.exportStatus) { split.exportStatus = 'idle'; mutated = true; }
            if (!split.uploadStatus) { split.uploadStatus = 'idle'; mutated = true; }
            if (split.videoPath === undefined) { split.videoPath = ''; mutated = true; }
            if (split.youtubeUrl === undefined) { split.youtubeUrl = ''; mutated = true; }
            if (split.youtubeId === undefined) { split.youtubeId = ''; mutated = true; }

            const teamANames = sanitizeFilename(split.teamA, 'Team A');
            const teamBNames = sanitizeFilename(split.teamB, 'Team B');
            const score = sanitizeFilename(split.score, 'Score');
            const cleanFilename = `${teamANames} vs ${teamBNames} (${score}).mp4`;
            const expectedPath = path.join(outputDir, cleanFilename);

            if (fs.existsSync(expectedPath)) {
              if (split.exportStatus !== 'completed') {
                split.exportStatus = 'completed';
                split.videoPath = expectedPath;
                mutated = true;
              }
            } else {
              if (split.exportStatus === 'completed') {
                split.exportStatus = 'idle';
                split.videoPath = '';
                mutated = true;
              }
            }
          });

          if (mutated) {
            fs.writeFileSync(projectFilePath, JSON.stringify(projectSession, null, 2), 'utf8');
          }
        }
      } catch (err) {
        console.error('Error loading saved session file:', err.message);
      }
    }

    res.json({
      dirPath: resolvedPath,
      files: fileDetails,
      projectSession: projectSession
    });

  } catch (error) {
    console.error('Scanning error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Custom range-based video streaming endpoint
 */
app.get('/api/stream', (req, res) => {
  const filePath = req.query.path;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Endpoint to save project session metadata
 */
app.post('/api/save-project', (req, res) => {
  const { dirPath, projectData } = req.body;

  if (!dirPath || !projectData) {
    return res.status(400).json({ error: 'Directory path and project data are required' });
  }

  try {
    const resolvedPath = path.resolve(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const projectFilePath = path.join(resolvedPath, 'badminton_session.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2), 'utf8');

    res.json({ success: true, message: 'Project session saved successfully' });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper to execute a spawned command and resolve/reject as a promise
 */
function spawnPromise(command, args, onLog) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let errorOutput = '';

    process.stdout.on('data', (data) => {
      onLog(data.toString());
    });

    process.stderr.on('data', (data) => {
      // ffmpeg writes general output to stderr, so we treat it as info unless it has a non-zero exit code
      onLog(data.toString());
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}. Errors:\n${errorOutput}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper to save project session metadata directly to disk
 */
function saveSessionStateDirectly(dirPath, splits, youtubeSettings) {
  try {
    const resolvedPath = path.resolve(dirPath);
    const projectFilePath = path.join(resolvedPath, 'badminton_session.json');
    let currentSession = {};
    if (fs.existsSync(projectFilePath)) {
      try {
        currentSession = JSON.parse(fs.readFileSync(projectFilePath, 'utf8'));
      } catch (_) {}
    }
    if (splits) currentSession.splits = splits;
    if (youtubeSettings) currentSession.youtubeSettings = youtubeSettings;
    fs.writeFileSync(projectFilePath, JSON.stringify(currentSession, null, 2), 'utf8');
  } catch (err) {
    console.error('[SYSTEM ERROR] Failed to save session state directly:', err.message);
  }
}

/**
 * Endpoint to export games (performs lossless cuts and joins using ffmpeg)
 * Uses HTTP chunked transfer to write progress back to the client in real-time
 */
app.post('/api/export', async (req, res) => {
  const { dirPath, splits, files, youtubeSettings } = req.body;

  if (!dirPath || !splits || !files || splits.length === 0) {
    return res.status(400).json({ error: 'Invalid parameters. Need dirPath, files list, and splits.' });
  }

  // Setup chunked response for streaming progress
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const sendProgress = (data) => {
    res.write(JSON.stringify(data) + '\n');
  };

  try {
    const resolvedPath = path.resolve(dirPath);
    const outputDir = path.join(resolvedPath, 'exported_games');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    sendProgress({ status: 'info', message: `Export directory initialized at: ${outputDir}` });

    const backgroundUploads = [];

    // Pre-calculate global boundaries for each file
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

    // Create a temporary workspace inside scratch / output dir
    const tempDir = path.join(outputDir, '.temp_clipper');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    // Iterate through each game split and perform the cuts
    for (let index = 0; index < splits.length; index++) {
      const split = splits[index];
      const gameNum = index + 1;
      const gameTitle = split.title || `Game_${gameNum}`;
      
      const teamANames = sanitizeFilename(split.teamA, 'Team A');
      const teamBNames = sanitizeFilename(split.teamB, 'Team B');
      const score = sanitizeFilename(split.score, 'Score');
      
      const cleanFilename = `${teamANames} vs ${teamBNames} (${score}).mp4`;
      const finalOutputPath = path.join(outputDir, cleanFilename);

      // Ensure properties exist on this split
      if (!split.exportStatus) split.exportStatus = 'idle';
      if (!split.uploadStatus) split.uploadStatus = 'idle';
      if (split.videoPath === undefined) split.videoPath = '';
      if (split.youtubeUrl === undefined) split.youtubeUrl = '';
      if (split.youtubeId === undefined) split.youtubeId = '';

      sendProgress({ 
        status: 'game_start', 
        gameIndex: index, 
        message: `Processing Game ${gameNum}/${splits.length}: "${gameTitle}"...` 
      });

      // CHECK RESUMPTION:
      const alreadyExported = split.exportStatus === 'completed' && fs.existsSync(finalOutputPath);
      if (alreadyExported) {
        sendProgress({ 
          status: 'info', 
          message: `Game ${gameNum} already exported (file exists). Skipping FFmpeg cutting/stitching.` 
        });
        
        split.exportStatus = 'completed';
        split.videoPath = finalOutputPath;
        saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

        sendProgress({ 
          status: 'game_complete', 
          gameIndex: index, 
          message: `Skipped Game ${gameNum}: Already exported at "exported_games/${cleanFilename}"`,
          outputPath: finalOutputPath,
          filename: cleanFilename
        });
      } else {
        // Not already exported! Perform the cut.
        const startSec = split.start;
        const endSec = split.end;
        const totalDuration = endSec - startSec;

        if (totalDuration <= 0) {
          sendProgress({ status: 'warning', message: `Skipping Game ${gameNum}: Invalid duration (${totalDuration}s)` });
          continue;
        }

        split.exportStatus = 'processing';
        split.videoPath = '';
        saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

        // 1. Identify which physical files intersect with [startSec, endSec]
        const intersectingFiles = [];
        for (const f of filesWithBoundaries) {
          const overlapStart = Math.max(f.globalStart, startSec);
          const overlapEnd = Math.min(f.globalEnd, endSec);
          if (overlapEnd > overlapStart) {
            intersectingFiles.push({
              file: f,
              overlapStart: overlapStart,
              overlapEnd: overlapEnd,
              relativeStart: overlapStart - f.globalStart,
              duration: overlapEnd - overlapStart
            });
          }
        }

        if (intersectingFiles.length === 0) {
          sendProgress({ status: 'warning', message: `Skipping Game ${gameNum}: Could not map global time to physical files.` });
          split.exportStatus = 'failed';
          saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);
          continue;
        }

        sendProgress({ 
          status: 'info', 
          message: `Game spans across ${intersectingFiles.length} file(s).` 
        });

        const tempPartPaths = [];
        let cutError = null;

        for (let i = 0; i < intersectingFiles.length; i++) {
          const item = intersectingFiles[i];
          const tempPartName = `temp_game_${gameNum}_part_${i + 1}.mp4`;
          const tempPartPath = path.join(tempDir, tempPartName);

          sendProgress({ 
            status: 'info', 
            message: `Cutting part ${i+1}/${intersectingFiles.length} from file ${item.file.name} (Start: ${item.relativeStart.toFixed(1)}s, Dur: ${item.duration.toFixed(1)}s)...` 
          });

          const args = [
            '-y',
            '-ss', item.relativeStart.toString(),
            '-t', item.duration.toString(),
            '-i', item.file.path,
            '-c', 'copy',
            '-map', '0:v',
            '-map', '0:a?',
            '-avoid_negative_ts', 'make_zero',
            tempPartPath
          ];

          try {
            await spawnPromise('ffmpeg', args, () => {});
            tempPartPaths.push(tempPartPath);
          } catch (err) {
            cutError = err;
            break;
          }
        }

        if (cutError) {
          sendProgress({ status: 'error', message: `FFmpeg cut failed: ${cutError.message}` });
          split.exportStatus = 'failed';
          saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);
          continue;
        }

        // 3. Join parts if there are multiple, or just rename if single
        try {
          if (tempPartPaths.length === 1) {
            sendProgress({ status: 'info', message: `Single part cut. Finalizing video...` });
            if (fs.existsSync(finalOutputPath)) {
              fs.unlinkSync(finalOutputPath);
            }
            fs.renameSync(tempPartPaths[0], finalOutputPath);
          } else {
            sendProgress({ status: 'info', message: `Stitching ${tempPartPaths.length} parts together losslessly...` });
            const listFilePath = path.join(tempDir, `concat_list_game_${gameNum}.txt`);
            const listContent = tempPartPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
            fs.writeFileSync(listFilePath, listContent, 'utf8');

            const tempConcatOutName = `temp_stitch_out_game_${gameNum}.mp4`;
            const tempConcatOutPath = path.join(tempDir, tempConcatOutName);

            const args = [
              '-y',
              '-f', 'concat',
              '-safe', '0',
              '-i', listFilePath,
              '-c', 'copy',
              tempConcatOutPath
            ];

            try {
              await spawnPromise('ffmpeg', args, () => {});
              sendProgress({ status: 'info', message: `Stitch completed successfully. Finalizing video...` });
              if (fs.existsSync(finalOutputPath)) {
                fs.unlinkSync(finalOutputPath);
              }
              fs.renameSync(tempConcatOutPath, finalOutputPath);
            } finally {
              try {
                tempPartPaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
                if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath);
              } catch (_) {}
            }
          }

          // SUCCESS
          split.exportStatus = 'completed';
          split.videoPath = finalOutputPath;
          saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

          sendProgress({ 
            status: 'game_complete', 
            gameIndex: index, 
            message: `Completed Game ${gameNum}: Successfully exported to "exported_games/${cleanFilename}"`,
            outputPath: finalOutputPath,
            filename: cleanFilename
          });

        } catch (err) {
          sendProgress({ status: 'error', message: `Finalizing video failed: ${err.message}` });
          split.exportStatus = 'failed';
          saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);
          continue;
        }
      }

      // 4. Asynchronously trigger background YouTube upload if requested
      if (youtubeSettings && youtubeSettings.autoUpload) {
        if (split.uploadStatus === 'completed' && split.youtubeUrl) {
          sendProgress({
            status: 'info',
            message: `Auto-Upload: Game ${gameNum} already uploaded (Skipping). URL: ${split.youtubeUrl}`
          });
          continue;
        }

        const titleTemplate = `${split.teamA || 'Team A'} vs ${split.teamB || 'Team B'} (${split.score || 'Score'})`;
        let desc = youtubeSettings.defaultDesc || 'Badminton Game Split';
        desc = desc
          .replace(/{players}/g, `${split.teamA || 'Team A'} vs ${split.teamB || 'Team B'}`)
          .replace(/{score}/g, split.score || 'N/A');

        split.uploadStatus = 'queued';
        saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

        const uploadPromise = (async () => {
          try {
            sendProgress({
              status: 'upload_start',
              gameIndex: index,
              message: `🚀 Auto-Upload: Queued Game ${gameNum} ("${titleTemplate}") for YouTube...`
            });

            split.uploadStatus = 'processing';
            saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

            const uploadResult = await performYoutubeUpload({
              videoPath: finalOutputPath,
              title: titleTemplate,
              description: desc,
              privacy: youtubeSettings.privacy || 'unlisted',
              playlistId: youtubeSettings.playlistId || null
            });

            split.uploadStatus = 'completed';
            split.youtubeUrl = uploadResult.url;
            split.youtubeId = uploadResult.youtubeId;
            saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);

            sendProgress({
              status: 'upload_complete',
              gameIndex: index,
              message: `✓ Auto-Upload: Game ${gameNum} successfully uploaded! URL: ${uploadResult.url}`,
              youtubeId: uploadResult.youtubeId,
              url: uploadResult.url
            });
          } catch (uploadErr) {
            console.error(`[BACKGROUND UPLOAD ERROR] Game ${gameNum} failed:`, uploadErr.message);
            split.uploadStatus = 'failed';
            saveSessionStateDirectly(resolvedPath, splits, youtubeSettings);
            
            sendProgress({
              status: 'upload_error',
              gameIndex: index,
              message: `⚠️ Auto-Upload: Game ${gameNum} failed to upload: ${uploadErr.message}`
            });
          }
        })();
        backgroundUploads.push(uploadPromise);
      }
    }

    // Cleanup temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.error('Error removing temp directory:', cleanupErr);
    }

    // Wait for all background uploads to settle before concluding chunked connection
    if (backgroundUploads.length > 0) {
      sendProgress({ 
        status: 'info', 
        message: `Waiting for ${backgroundUploads.length} background YouTube upload(s) to complete...` 
      });
      await Promise.allSettled(backgroundUploads);
    }

    sendProgress({ 
      status: 'all_complete', 
      message: `All games successfully processed! Saved inside: ${outputDir}` 
    });

    res.end();

  } catch (err) {
    console.error('Exporting error:', err);
    sendProgress({ status: 'critical_error', message: `Export stopped due to error: ${err.message}` });
    res.end();
  }
});

/**
 * Endpoint to manually upload or retry uploading a single game split
 */
app.post('/api/upload-single', async (req, res) => {
  const { dirPath, splitIndex, youtubeSettings } = req.body;

  if (!dirPath || splitIndex === undefined) {
    return res.status(400).json({ error: 'dirPath and splitIndex are required.' });
  }

  try {
    const resolvedPath = path.resolve(dirPath);
    const projectFilePath = path.join(resolvedPath, 'badminton_session.json');

    if (!fs.existsSync(projectFilePath)) {
      return res.status(404).json({ error: 'Project session file not found.' });
    }

    const sessionContent = fs.readFileSync(projectFilePath, 'utf8');
    const projectSession = JSON.parse(sessionContent);
    const splits = projectSession.splits;

    if (!splits || !splits[splitIndex]) {
      return res.status(404).json({ error: 'Split index not found in session.' });
    }

    const split = splits[splitIndex];

    // Compute expected filename and path
    const teamANames = sanitizeFilename(split.teamA, 'Team A');
    const teamBNames = sanitizeFilename(split.teamB, 'Team B');
    const score = sanitizeFilename(split.score, 'Score');
    const cleanFilename = `${teamANames} vs ${teamBNames} (${score}).mp4`;
    const outputDir = path.join(resolvedPath, 'exported_games');
    const expectedPath = path.join(outputDir, cleanFilename);

    if (!fs.existsSync(expectedPath)) {
      return res.status(404).json({ error: `Exported video file not found at: ${expectedPath}. Please export the video first.` });
    }

    // Update state to processing and save
    split.uploadStatus = 'processing';
    split.videoPath = expectedPath;
    fs.writeFileSync(projectFilePath, JSON.stringify(projectSession, null, 2), 'utf8');

    // Title and Description
    const titleTemplate = `${split.teamA || 'Team A'} vs ${split.teamB || 'Team B'} (${split.score || 'Score'})`;
    let desc = (youtubeSettings && youtubeSettings.defaultDesc) || 'Badminton Game Split';
    desc = desc
      .replace(/{players}/g, `${split.teamA || 'Team A'} vs ${split.teamB || 'Team B'}`)
      .replace(/{score}/g, split.score || 'N/A');

    const privacy = (youtubeSettings && youtubeSettings.privacy) || 'unlisted';
    const playlistId = (youtubeSettings && youtubeSettings.playlistId) || null;

    console.log(`[MANUAL UPLOAD] Starting upload for split ${splitIndex} ("${titleTemplate}")...`);
    
    const uploadResult = await performYoutubeUpload({
      videoPath: expectedPath,
      title: titleTemplate,
      description: desc,
      privacy: privacy,
      playlistId: playlistId
    });

    // Update state to completed and save
    split.uploadStatus = 'completed';
    split.youtubeUrl = uploadResult.url;
    split.youtubeId = uploadResult.youtubeId;
    fs.writeFileSync(projectFilePath, JSON.stringify(projectSession, null, 2), 'utf8');

    res.json({
      success: true,
      message: `Game successfully uploaded to YouTube!`,
      youtubeId: uploadResult.youtubeId,
      url: uploadResult.url
    });

  } catch (error) {
    console.error('[MANUAL UPLOAD ERROR] Single upload failed:', error);
    
    // Attempt to mark as failed and save
    try {
      const resolvedPath = path.resolve(dirPath);
      const projectFilePath = path.join(resolvedPath, 'badminton_session.json');
      if (fs.existsSync(projectFilePath)) {
        const projectSession = JSON.parse(fs.readFileSync(projectFilePath, 'utf8'));
        if (projectSession.splits && projectSession.splits[splitIndex]) {
          projectSession.splits[splitIndex].uploadStatus = 'failed';
          fs.writeFileSync(projectFilePath, JSON.stringify(projectSession, null, 2), 'utf8');
        }
      }
    } catch (_) {}

    res.status(500).json({ error: error.message });
  }
});

const PROFILES_FILE = path.join(__dirname, 'global_youtube_profiles.json');

// Helper to load global YouTube profiles
function loadGlobalProfiles() {
  if (!fs.existsSync(PROFILES_FILE)) {
    return { activeProfileId: null, profiles: [] };
  }
  try {
    const data = fs.readFileSync(PROFILES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading global profiles:', err.message);
    return { activeProfileId: null, profiles: [] };
  }
}

// Helper to save global YouTube profiles
function saveGlobalProfiles(data) {
  try {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving global profiles:', err.message);
    return false;
  }
}

/**
 * Helper to refresh Google OAuth access token globally if expired
 */
async function getOrRefreshAccessToken() {
  const globalData = loadGlobalProfiles();
  const profile = globalData.profiles.find(p => p.id === globalData.activeProfileId);
  if (!profile || !profile.tokens || !profile.tokens.accessToken) return null;

  const { tokens, clientId, clientSecret } = profile;

  // Check if expired (or within 60s of expiring)
  if (Date.now() < tokens.expiryTime - 60000) {
    return tokens.accessToken;
  }

  // Token is expired! Refresh it
  if (!tokens.refreshToken) return null;

  try {
    console.log(`[SYSTEM] Access token expired for profile "${profile.name}". Refreshing...`);
    const bodyParams = new URLSearchParams();
    bodyParams.append('client_id', clientId);
    bodyParams.append('client_secret', clientSecret);
    bodyParams.append('refresh_token', tokens.refreshToken);
    bodyParams.append('grant_type', 'refresh_token');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || 'Refresh failed');
    }

    profile.tokens.accessToken = data.access_token;
    profile.tokens.expiryTime = Date.now() + (data.expires_in * 1000);
    
    // Save updated profiles
    saveGlobalProfiles(globalData);

    console.log('[SYSTEM] Access token successfully refreshed globally.');
    return profile.tokens.accessToken;
  } catch (err) {
    console.error('Error refreshing Google access token:', err.message);
    return null;
  }
}

/**
 * Endpoint to list all saved YouTube login profiles
 */
app.get('/api/youtube-profiles', (req, res) => {
  const globalData = loadGlobalProfiles();
  const safeProfiles = globalData.profiles.map(p => ({
    id: p.id,
    name: p.name,
    subscribers: p.subscribers,
    clientId: p.clientId,
    avatarColor: p.avatarColor,
    isMock: p.isMock || false,
    hasTokens: !!(p.tokens && p.tokens.refreshToken)
  }));

  res.json({
    activeProfileId: globalData.activeProfileId,
    profiles: safeProfiles
  });
});

/**
 * Endpoint to set the active YouTube profile
 */
app.post('/api/youtube-profiles/active', (req, res) => {
  const { id } = req.body;
  const globalData = loadGlobalProfiles();

  if (id === null || id === 'offline') {
    globalData.activeProfileId = null;
    saveGlobalProfiles(globalData);
    return res.json({ success: true, message: 'Switched to Offline/Simulation Mode' });
  }

  const profile = globalData.profiles.find(p => p.id === id);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  globalData.activeProfileId = id;
  saveGlobalProfiles(globalData);
  res.json({ success: true, activeProfileId: id });
});

/**
 * Endpoint to delete a YouTube profile
 */
app.post('/api/youtube-profiles/delete', (req, res) => {
  const { id } = req.body;
  const globalData = loadGlobalProfiles();

  const profileIndex = globalData.profiles.findIndex(p => p.id === id);
  if (profileIndex === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  globalData.profiles.splice(profileIndex, 1);
  if (globalData.activeProfileId === id) {
    globalData.activeProfileId = globalData.profiles.length > 0 ? globalData.profiles[0].id : null;
  }

  saveGlobalProfiles(globalData);
  res.json({ success: true, activeProfileId: globalData.activeProfileId });
});

/**
 * Endpoint to create a mock YouTube profile for Simulation Mode
 */
app.post('/api/youtube-profiles/create-mock', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Profile name is required' });
  }

  const globalData = loadGlobalProfiles();
  const mockId = 'mock_' + Date.now();
  const colors = ['#00F5D4', '#7B2CBF', '#FF007F', '#FF9F1C', '#3A86FF'];
  const avatarColor = colors[globalData.profiles.length % colors.length];

  const newProfile = {
    id: mockId,
    name: name,
    subscribers: (Math.floor(Math.random() * 50) + 1) + 'K',
    clientId: 'MOCK_CLIENT_ID',
    clientSecret: 'MOCK_CLIENT_SECRET',
    avatarColor: avatarColor,
    isMock: true,
    tokens: {
      accessToken: 'MOCK_ACCESS_TOKEN',
      refreshToken: 'MOCK_REFRESH_TOKEN',
      expiryTime: Date.now() + 3600000
    }
  };

  globalData.profiles.push(newProfile);
  globalData.activeProfileId = mockId;
  saveGlobalProfiles(globalData);

  res.json({ success: true, profile: newProfile });
});

/**
 * Endpoint to retrieve available YouTube channels (using active global profile)
 */
app.get('/api/youtube-channels', async (req, res) => {
  const globalData = loadGlobalProfiles();
  const activeProfile = globalData.profiles.find(p => p.id === globalData.activeProfileId);

  if (activeProfile && activeProfile.tokens && activeProfile.tokens.accessToken && !activeProfile.isMock) {
    const accessToken = await getOrRefreshAccessToken();
    if (accessToken) {
      try {
        // Fetch live channels from YouTube API
        const youtubeResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const youtubeData = await youtubeResponse.json();
        
        if (youtubeResponse.ok && youtubeData.items) {
          const liveChannels = youtubeData.items.map(item => ({
            id: item.id,
            name: item.snippet.title,
            subscribers: item.statistics.subscriberCount ? parseInt(item.statistics.subscriberCount).toLocaleString() : '0',
            primary: true,
            avatarColor: activeProfile.avatarColor || '#00F5D4'
          }));
          
          return res.json({ success: true, channels: liveChannels });
        } else {
          return res.json({ success: false, needs_auth: true, error: youtubeData.error ? youtubeData.error.message : 'Google authentication expired' });
        }
      } catch (e) {
        console.error('Error reading live YouTube channels:', e.message);
      }
    }
  }

  // Fallback to high-fidelity mock list if offline/simulation or active profile is mock/blank
  const mockChannels = [
    { id: 'UC1', name: activeProfile && activeProfile.isMock ? activeProfile.name : 'Smash Masters Badminton', subscribers: activeProfile && activeProfile.isMock ? activeProfile.subscribers : '125K', primary: true, avatarColor: activeProfile ? activeProfile.avatarColor : '#00F5D4' },
    { id: 'UC2', name: 'Personal Badminton Archive', subscribers: '48', primary: false, avatarColor: '#7B2CBF' },
    { id: 'UC3', name: 'Court Conquerors HD', subscribers: '12.4K', primary: false, avatarColor: '#FF0055' },
    { id: 'UC4', name: 'GoPro Court Diaries', subscribers: '820', primary: false, avatarColor: '#FF9F1C' },
    { id: 'UC5', name: 'Prosenjit Badminton Channel', subscribers: '1.2K', primary: false, avatarColor: '#3A86FF' }
  ];
  res.json({ success: true, channels: mockChannels });
});

/**
 * Endpoint to serve a simulated Google Login Page (Simulation Mode)
 */
app.get('/api/mock-google-login', (req, res) => {
  const { state } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sign in - Google Accounts</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        body {
          background: #0B0A11;
          color: #E2E8F0;
          font-family: 'Outfit', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: rgba(15, 14, 23, 0.85);
          border: 1px solid #7B2CBF;
          border-radius: 16px;
          padding: 35px;
          box-shadow: 0 12px 40px rgba(123, 44, 191, 0.25);
          width: 380px;
          box-sizing: border-box;
          text-align: center;
        }
        h1 {
          color: #E2E8F0;
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .subtitle {
          color: #94A3B8;
          font-size: 13px;
          margin-bottom: 25px;
        }
        .list-header {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #00F5D4;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }
        .account-row {
          display: flex;
          align-items: center;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 10px;
          text-align: left;
        }
        .account-row:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: #00F5D4;
        }
        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #7B2CBF;
          color: #FFF;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          font-size: 13px;
          flex-shrink: 0;
        }
        .info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .name {
          font-size: 13px;
          font-weight: 600;
          color: #FFF;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .email {
          font-size: 11px;
          color: #94A3B8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .screen {
          animation: fade 0.3s ease-out;
        }
        @keyframes fade {
          0% { opacity: 0; transform: translateY(5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div style="font-size: 32px; margin-bottom: 10px; text-shadow: 0 0 15px rgba(0, 245, 212, 0.3);">🏸</div>
        
        <!-- Screen 1: Choose Mock Google Account -->
        <div id="screen-accounts" class="screen">
          <h1>Sign in with Google</h1>
          <div class="subtitle">to continue to Badminton GoPro Clipper</div>
          
          <div class="list-header">Choose an Account (Simulated)</div>
          
          <div class="account-row" onclick="chooseAccount('Prosenjit Sinha', 'prosenjit@gmail.com', 'PS')">
            <div class="avatar" style="background:#00F5D4; color:#000;">PS</div>
            <div class="info">
              <span class="name">Prosenjit Sinha</span>
              <span class="email">prosenjit@gmail.com</span>
            </div>
          </div>
          
          <div class="account-row" onclick="chooseAccount('Smash Club Admin', 'smashmasters@gmail.com', 'SC')">
            <div class="avatar" style="background:#7B2CBF;">SC</div>
            <div class="info">
              <span class="name">Smash Club Admin</span>
              <span class="email">smashmasters@gmail.com</span>
            </div>
          </div>
        </div>
        
        <!-- Screen 2: Choose YouTube Channel -->
        <div id="screen-channels" class="screen" style="display: none;">
          <h1>Select YouTube Channel</h1>
          <div class="subtitle" id="selected-email"></div>
          
          <div class="list-header">Grant Permissions to Channel</div>
          <div id="channels-container"></div>
        </div>
      </div>
      
      <script>
        const state = "${state}";
        let selectedUser = '';

        function chooseAccount(name, email, initials) {
          selectedUser = name;
          document.getElementById('screen-accounts').style.display = 'none';
          document.getElementById('screen-channels').style.display = 'block';
          document.getElementById('selected-email').textContent = email;
          
          const channelsContainer = document.getElementById('channels-container');
          channelsContainer.innerHTML = '';
          
          let channels = [];
          if (name.includes('Prosenjit')) {
            channels = [
              { name: 'Prosenjit Badminton Channel', subs: '1.2K' },
              { name: 'Personal Badminton Archive', subs: '48' }
            ];
          } else {
            channels = [
              { name: 'Smash Masters Badminton', subs: '125K' },
              { name: 'Court Conquerors HD', subs: '12.4K' }
            ];
          }
          
          channels.forEach(ch => {
            const div = document.createElement('div');
            div.className = 'account-row';
            div.onclick = () => selectChannel(ch.name, ch.subs);
            div.innerHTML = \`
              <div class="avatar" style="background:#3A86FF; color:#fff;">🎥</div>
              <div class="info">
                <span class="name">\${ch.name}</span>
                <span class="email">\${ch.subs} subscribers</span>
              </div>
            \`;
            channelsContainer.appendChild(div);
          });
        }

        function selectChannel(name, subs) {
          // Redirect back to our callback with mock parameters
          const callbackUrl = \`/api/oauth-callback?code=mock_code&state=\${state}&mockChannelName=\${encodeURIComponent(name)}&mockSubs=\${encodeURIComponent(subs)}\`;
          window.location.href = callbackUrl;
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Endpoint to generate Google OAuth Redirect URL
 */
app.get('/api/youtube-auth-url', (req, res) => {
  let { clientId, clientSecret } = req.query;
  
  // Fallback to built-in default developer credentials if left blank
  clientId = clientId || DEFAULT_CLIENT_ID;
  clientSecret = clientSecret || DEFAULT_CLIENT_SECRET;
  
  // Encode credentials in state parameter to make callback stateless
  const stateObject = { clientId, clientSecret };
  const stateParam = Buffer.from(JSON.stringify(stateObject)).toString('base64');

  const redirectUri = `http://localhost:4000/api/oauth-callback`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/youtube&access_type=offline&prompt=consent%20select_account&state=${stateParam}`;
  
  res.json({ success: true, url: authUrl });
});

/**
 * Endpoint to process Google OAuth redirect callback
 */
app.get('/api/oauth-callback', async (req, res) => {
  const { code, state, mockChannelName, mockSubs } = req.query;
  if (!code || !state) {
    return res.status(400).send('Missing authorization code or state');
  }

  try {
    // Decode client credentials from state
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    const { clientId, clientSecret } = decodedState;

    if (!clientId || !clientSecret) {
      throw new Error('OAuth Client credentials not found in state parameter');
    }

    let channelId = 'unknown_channel_' + Date.now();
    let channelTitle = 'Authorized YouTube Channel';
    let subscriberCount = '0';
    let tokenData = {};
    let isMockProfile = false;

    if (code === 'mock_code') {
      // Offline Simulation login!
      isMockProfile = true;
      channelId = 'mock_channel_' + Date.now();
      channelTitle = mockChannelName || 'Simulated YouTube Channel';
      subscriberCount = mockSubs || '1.2K';
      tokenData = {
        access_token: 'MOCK_ACCESS_TOKEN_' + Date.now(),
        refresh_token: 'MOCK_REFRESH_TOKEN_' + Date.now(),
        expires_in: 3600
      };
    } else {
      // Exchange code for tokens
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const redirectUri = `http://localhost:4000/api/oauth-callback`;
      
      const bodyParams = new URLSearchParams();
      bodyParams.append('code', code);
      bodyParams.append('client_id', clientId);
      bodyParams.append('client_secret', clientSecret);
      bodyParams.append('redirect_uri', redirectUri);
      bodyParams.append('grant_type', 'authorization_code');

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });

      tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Failed to exchange tokens');
      }

      // Now query YouTube API to fetch Channel details (name & subscriber count)
      try {
        console.log('[SYSTEM] Fetching YouTube channel details with access token...');
        const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const channelData = await channelResponse.json();
        
        if (channelResponse.ok && channelData.items && channelData.items.length > 0) {
          const item = channelData.items[0];
          channelId = item.id;
          channelTitle = item.snippet.title;
          subscriberCount = item.statistics.subscriberCount || '0';
          console.log(`[SYSTEM] Authenticated channel: "${channelTitle}" with ${subscriberCount} subscribers.`);
        } else {
          console.log('[SYSTEM] Channel list query did not return any channels. Response:', channelData);
        }
      } catch (apiErr) {
        console.error('Error fetching channel details during callback:', apiErr.message);
      }
    }

    // Load and update profiles list
    const globalData = loadGlobalProfiles();
    
    // Check if profile already exists
    let existingProfile = globalData.profiles.find(p => p.id === channelId);
    
    if (existingProfile) {
      existingProfile.name = channelTitle;
      existingProfile.subscribers = isMockProfile ? subscriberCount : parseInt(subscriberCount).toLocaleString();
      existingProfile.clientId = clientId;
      existingProfile.clientSecret = clientSecret;
      existingProfile.tokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || existingProfile.tokens.refreshToken, // Google only sends refresh token on first consent
        expiryTime: Date.now() + (tokenData.expires_in * 1000)
      };
    } else {
      const colors = ['#00F5D4', '#7B2CBF', '#FF007F', '#FF9F1C', '#3A86FF'];
      const avatarColor = colors[globalData.profiles.length % colors.length];
      
      globalData.profiles.push({
        id: channelId,
        name: channelTitle,
        subscribers: isMockProfile ? subscriberCount : parseInt(subscriberCount).toLocaleString(),
        clientId,
        clientSecret,
        avatarColor,
        isMock: isMockProfile,
        tokens: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiryTime: Date.now() + (tokenData.expires_in * 1000)
        }
      });
    }

    globalData.activeProfileId = channelId;
    saveGlobalProfiles(globalData);

    // Return beautiful HTML confirmation
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            background: #0B0A11;
            color: #E2E8F0;
            font-family: 'Outfit', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .card {
            background: rgba(15, 14, 23, 0.85);
            border: 1px solid #00F5D4;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(0, 245, 212, 0.2);
            max-width: 420px;
          }
          h1 {
            color: #00F5D4;
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 10px;
          }
          p {
            color: #94A3B8;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 25px;
          }
          .btn {
            background: #00F5D4;
            color: #0B0A11;
            font-weight: 700;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: transform 0.2s;
          }
          .btn:hover {
            transform: scale(1.05);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <span style="font-size: 48px; display:block; margin-bottom: 15px;">🎉</span>
          <h1>Authentication Successful!</h1>
          <p>Your Google Account has been securely connected to channel <strong>${channelTitle}</strong> ${isMockProfile ? '(Simulation Mode)' : ''}. You can close this tab and return to the Badminton GoPro Clipper app.</p>
          <button class="btn" onclick="window.close()">Close Window</button>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage('oauth-success', '*');
            }
          } catch(e) {}
          setTimeout(() => { window.close(); }, 3000);
        </script>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('OAuth Callback Error:', err.message);
    res.status(500).send(`Authentication Failed: ${err.message}`);
  }
});

/**
 * Placeholder for YouTube upload API Integration
 */
app.get('/api/youtube-playlists', async (req, res) => {
  const globalData = loadGlobalProfiles();
  const activeProfile = globalData.profiles.find(p => p.id === globalData.activeProfileId);

  // Fallback to simulation mode if offline or profile is mock
  if (!activeProfile || activeProfile.isMock || !activeProfile.tokens || !activeProfile.tokens.accessToken) {
    console.log('[SYSTEM] Fetching simulated YouTube playlists (Simulation Mode)...');
    return res.json({
      success: true,
      playlists: [
        { id: 'PL_mock1', title: '🏸 Weekly Club Matches', description: 'Our weekly sessions', privacyStatus: 'unlisted' },
        { id: 'PL_mock2', title: '🏆 Club Championship 2026', description: 'Annual tournament matches', privacyStatus: 'public' }
      ]
    });
  }

  try {
    const accessToken = await getOrRefreshAccessToken();
    if (!accessToken) {
      throw new Error('Google authorization expired and could not be refreshed.');
    }

    const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status&mine=true&maxResults=50', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ? data.error.message : 'Failed to fetch playlists from YouTube');
    }

    const playlists = (data.items || []).map(item => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description || '',
      privacyStatus: item.status ? item.status.privacyStatus : 'unlisted'
    }));

    return res.json({ success: true, playlists });
  } catch (err) {
    console.error('[YOUTUBE PLAYLISTS ERROR]:', err.message);
    return res.status(500).json({ error: `Failed to fetch YouTube playlists: ${err.message}` });
  }
});

app.post('/api/youtube-playlists/create', async (req, res) => {
  const { title, description, privacy } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Playlist title is required' });
  }

  const globalData = loadGlobalProfiles();
  const activeProfile = globalData.profiles.find(p => p.id === globalData.activeProfileId);

  // Fallback to simulation mode if offline or profile is mock
  if (!activeProfile || activeProfile.isMock || !activeProfile.tokens || !activeProfile.tokens.accessToken) {
    console.log(`[SYSTEM] Creating simulated YouTube playlist "${title}" (Simulation Mode)...`);
    const mockId = `PL_mock_${Date.now()}`;
    return res.json({
      success: true,
      playlist: {
        id: mockId,
        title: title,
        description: description || '',
        privacyStatus: privacy || 'unlisted'
      }
    });
  }

  try {
    const accessToken = await getOrRefreshAccessToken();
    if (!accessToken) {
      throw new Error('Google authorization expired and could not be refreshed.');
    }

    const requestBody = {
      snippet: {
        title: title,
        description: description || ''
      },
      status: {
        privacyStatus: privacy || 'unlisted'
      }
    };

    const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ? data.error.message : 'Failed to create playlist');
    }

    return res.json({
      success: true,
      playlist: {
        id: data.id,
        title: data.snippet.title,
        description: data.snippet.description || '',
        privacyStatus: data.status ? data.status.privacyStatus : 'unlisted'
      }
    });
  } catch (err) {
    console.error('[YOUTUBE PLAYLIST CREATE ERROR]:', err.message);
    return res.status(500).json({ error: `Failed to create playlist: ${err.message}` });
  }
});

/**
 * Shared core YouTube upload helper (supporting resumable uploads, mock modes, and playlists)
 */
async function performYoutubeUpload({ videoPath, title, description, privacy, playlistId }) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('Video file not found');
  }

  const globalData = loadGlobalProfiles();
  const activeProfile = globalData.profiles.find(p => p.id === globalData.activeProfileId);

  // If we have a real active profile with live tokens, let's do a REAL live upload!
  if (activeProfile && activeProfile.tokens && activeProfile.tokens.accessToken && !activeProfile.isMock) {
    console.log(`[SYSTEM] Starting real YouTube Upload for file "${videoPath}" to channel "${activeProfile.name}"...`);
    const accessToken = await getOrRefreshAccessToken();
    if (!accessToken) {
      throw new Error('Google authorization expired and could not be refreshed.');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;

    // 1. Resumable Upload Initial Request
    const metadata = {
      snippet: {
        title: title || path.basename(videoPath, '.mp4'),
        description: description || 'Badminton Game Split',
        categoryId: '17' // 'Sports' category ID is 17!
      },
      status: {
        privacyStatus: privacy || 'unlisted'
      }
    };

    console.log('[SYSTEM] Sending metadata for resumable upload session...');
    const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileSize.toString(),
        'X-Upload-Content-Type': 'video/*'
      },
      body: JSON.stringify(metadata)
    });

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`Google Upload session initialization failed: ${errText}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Google Upload session failed to return a Resumable Location header.');
    }

    console.log('[SYSTEM] Resumable session created. Streaming video bytes directly to YouTube...');
    
    // 2. Stream the video file contents in the PUT request
    const fileStream = fs.createReadStream(videoPath);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': 'video/*'
      },
      body: fileStream,
      duplex: 'half'
    });

    const uploadResult = await uploadResponse.json();
    if (!uploadResponse.ok) {
      throw new Error(uploadResult.error ? uploadResult.error.message : 'Byte stream upload failed');
    }

    const youtubeId = uploadResult.id;
    const videoUrl = `https://youtu.be/${youtubeId}`;

    console.log(`[SYSTEM] Live Upload completed! Video URL: ${videoUrl}`);

    // 3. Add video to playlist if playlistId is specified
    let playlistMessage = '';
    if (playlistId) {
      try {
        console.log(`[SYSTEM] Adding uploaded video ${youtubeId} to playlist ${playlistId}...`);
        const playlistItemBody = {
          snippet: {
            playlistId: playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId: youtubeId
            }
          }
        };

        const piResponse = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(playlistItemBody)
        });

        if (!piResponse.ok) {
          const piErr = await piResponse.json();
          console.error('[YOUTUBE PLAYLIST ADD ERROR] Failed to add video to playlist:', piErr);
          playlistMessage = ` (Warning: Failed to add to playlist: ${piErr.error ? piErr.error.message : 'Unknown API error'})`;
        } else {
          console.log(`[SYSTEM] Successfully added video ${youtubeId} to playlist ${playlistId}`);
          playlistMessage = ' (Added to playlist)';
        }
      } catch (piErr) {
        console.error('[YOUTUBE PLAYLIST ADD EXCEPTION] Failed to add video to playlist:', piErr.message);
        playlistMessage = ` (Warning: Failed to add to playlist: ${piErr.message})`;
      }
    }

    return {
      success: true,
      message: `Successfully uploaded "${title}" to YouTube!${playlistMessage}`,
      youtubeId: youtubeId,
      url: videoUrl
    };
  }

  // Fallback to simulation mode if offline or profile is mock
  console.log(`[SYSTEM] Simulating YouTube Upload for file ${videoPath} (Offline/Simulation Mode)`);
  if (playlistId) {
    console.log(`[SYSTEM] Mock Upload: Simulating adding video dQw4w9WgXcQ to playlist "${playlistId}"`);
  }
  
  // Simulated upload delay
  await new Promise(resolve => setTimeout(resolve, 2600));
  
  return {
    success: true,
    message: `Upload simulated successfully.${playlistId ? ' (Added to playlist)' : ''}`,
    youtubeId: 'dQw4w9WgXcQ', // Mock ID
    url: 'https://youtu.be/dQw4w9WgXcQ'
  };
}

/**
 * Endpoint to upload video to YouTube
 */
app.post('/api/youtube-upload', async (req, res) => {
  const { videoPath, title, description, privacy, playlistId } = req.body;
  try {
    const result = await performYoutubeUpload({ videoPath, title, description, privacy, playlistId });
    return res.json(result);
  } catch (err) {
    console.error('[YOUTUBE UPLOAD ENDPOINT ERROR]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Serve frontend SPA for all remaining routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Badminton GoPro Video Splitter Backend Running!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Working directory: ${__dirname}`);
  console.log(`=======================================================`);
});
