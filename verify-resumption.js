const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testResumptionAPI() {
  console.log('=======================================================');
  console.log('RUNNING BACKEND RESUMPTION & persistence TESTS');
  console.log('=======================================================');

  const BASE_URL = 'http://localhost:4000';
  const workspacePath = '/Users/prosenjitsinha/.gemini/antigravity/scratch/badminton-game-cutter';
  const sessionDir = path.join(workspacePath, 'mock_gopro_session');
  const projectFilePath = path.join(sessionDir, 'badminton_session.json');
  const outputDir = path.join(sessionDir, 'exported_games');

  // Ensure directories exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Write structured badminton_session.json to mock previous interrupted run
  console.log('[TEST 1] Initializing mock interrupted session file...');
  const mockSplits = [
    {
      start: 5,
      end: 25,
      title: "Game 1",
      teamA: "Prosenjit/Joe",
      teamB: "Mark/Dan",
      score: "21-19",
      exportStatus: "completed",
      uploadStatus: "idle",
      videoPath: path.join(outputDir, "Prosenjit-Joe vs Mark-Dan (21-19).mp4"),
      youtubeUrl: "",
      youtubeId: ""
    },
    {
      start: 30,
      end: 50,
      title: "Game 2",
      teamA: "Amit/Ranadip",
      teamB: "Alok/Priyanka",
      score: "21-15",
      exportStatus: "idle",
      uploadStatus: "idle",
      videoPath: "",
      youtubeUrl: "",
      youtubeId: ""
    }
  ];

  const mockSession = {
    splits: mockSplits,
    youtubeSettings: {
      autoUpload: false,
      privacy: "unlisted",
      defaultDesc: "🏸 Badminton Game Match: {players} (Score: {score})"
    }
  };

  fs.writeFileSync(projectFilePath, JSON.stringify(mockSession, null, 2), 'utf8');
  console.log('✓ Mock badminton_session.json written.');

  // Create physical dummy file for Game 1 to satisfy existsSync check
  const game1Path = mockSplits[0].videoPath;
  fs.writeFileSync(game1Path, 'dummy video bytes', 'utf8');
  console.log(`✓ Dummy exported video file created at: ${game1Path}`);

  // Delete Game 2 output if it exists from previous tests
  const game2Path = path.join(outputDir, "Amit-Ranadip vs Alok-Priyanka (21-15).mp4");
  if (fs.existsSync(game2Path)) {
    fs.unlinkSync(game2Path);
  }

  // 2. Fetch via POST /api/scan and check self-healing auto-detection
  console.log('\n[TEST 2] Verifying POST /api/scan auto-detects existing exports...');
  const scanRes = await fetch(`${BASE_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirPath: sessionDir })
  });
  const scanData = await scanRes.json();
  
  assert.ok(scanData.projectSession);
  const scanSplits = scanData.projectSession.splits;
  assert.equal(scanSplits[0].exportStatus, 'completed');
  assert.equal(scanSplits[0].videoPath, game1Path);
  assert.equal(scanSplits[1].exportStatus, 'idle');
  console.log('✓ scan returned correct self-healed statuses!');

  // 3. Trigger /api/export and inspect chunked response stream
  console.log('\n[TEST 3] Running /api/export to test resumption skipping...');
  const exportPayload = {
    dirPath: sessionDir,
    splits: scanSplits,
    files: [
      { name: "GH010023.MP4", path: path.join(sessionDir, "GH010023.MP4"), duration: 10 },
      { name: "GH020023.MP4", path: path.join(sessionDir, "GH020023.MP4"), duration: 20 },
      { name: "GH030023.MP4", path: path.join(sessionDir, "GH030023.MP4"), duration: 25 }
    ],
    youtubeSettings: {
      autoUpload: false
    }
  };

  const exportRes = await fetch(`${BASE_URL}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exportPayload)
  });

  const reader = exportRes.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let skippedGame1 = false;
  let processedGame2 = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        const chunk = JSON.parse(line);
        if (chunk.status === 'info' && chunk.message.includes('Skipping FFmpeg cutting/stitching')) {
          skippedGame1 = true;
          console.log(`[STREAM CHUNK] Game 1 Resumption detected: "${chunk.message}"`);
        }
        if (chunk.status === 'game_complete' && chunk.gameIndex === 1) {
          processedGame2 = true;
          console.log(`[STREAM CHUNK] Game 2 Export finished: "${chunk.message}"`);
        }
      }
    }
  }

  assert.ok(skippedGame1, 'Export pipeline did not skip Game 1');
  assert.ok(processedGame2, 'Export pipeline did not process Game 2');
  console.log('✓ Chunked transfer stream confirms Game 1 was skipped and Game 2 was cut and saved.');

  // Verify badminton_session.json has been updated dynamically
  const updatedSession = JSON.parse(fs.readFileSync(projectFilePath, 'utf8'));
  assert.equal(updatedSession.splits[0].exportStatus, 'completed');
  assert.equal(updatedSession.splits[1].exportStatus, 'completed');
  assert.ok(fs.existsSync(game2Path), 'Game 2 physical MP4 output was not created');
  console.log('✓ Dynamic session file persistence verified. Both games completed.');

  // 4. Test manual upload trigger via /api/upload-single using simulation fallback
  console.log('\n[TEST 4] Activating a simulation YouTube profile for testing uploads...');
  // Ensure we have a simulation profile
  const profileRes = await fetch(`${BASE_URL}/api/youtube-profiles/create-mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Portable Test Runner Channel' })
  });
  const profileData = await profileRes.json();
  assert.ok(profileData.success);

  console.log('[TEST 4] Triggering POST /api/upload-single for Game 2...');
  const uploadRes = await fetch(`${BASE_URL}/api/upload-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dirPath: sessionDir,
      splitIndex: 1,
      youtubeSettings: {
        privacy: "unlisted",
        defaultDesc: "Test dynamic upload description: {players}"
      }
    })
  });
  const uploadData = await uploadRes.json();
  assert.ok(uploadRes.ok);
  assert.ok(uploadData.success);
  assert.ok(uploadData.url);
  console.log(`✓ Manual YouTube Upload successful! Video URL: ${uploadData.url}`);

  // Check final session file state
  const finalSession = JSON.parse(fs.readFileSync(projectFilePath, 'utf8'));
  assert.equal(finalSession.splits[1].uploadStatus, 'completed');
  assert.equal(finalSession.splits[1].youtubeUrl, uploadData.url);
  console.log('✓ Session file state has uploadStatus = completed and active YouTube URL.');

  // Cleanup dummy profiles
  await fetch(`${BASE_URL}/api/youtube-profiles/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profileData.profile.id })
  });

  // Cleanup files
  try {
    if (fs.existsSync(game1Path)) fs.unlinkSync(game1Path);
    console.log('✓ Cleaned up dummy test files.');
  } catch(_) {}

  console.log('\n=======================================================');
  console.log('🎉 ALL BACKEND PIPELINE RESUMPTION INTEGRATION TESTS PASSED!');
  console.log('=======================================================');
}

testResumptionAPI().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
