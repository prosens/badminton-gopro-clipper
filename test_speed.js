const { spawn } = require('child_process');
const path = require('path');

function testSpeed() {
  const filePath = path.join(__dirname, 'mock_gopro_session', 'GH010023.MP4');
  const width = 160;
  const height = 90;
  const frameSize = width * height;
  const sampleInterval = 2;

  const args = [
    '-skip_frame', 'nokey', // skip decoding non-keyframes
    '-v', 'error',
    '-i', filePath,
    '-vf', `fps=1/${sampleInterval},scale=${width}:${height},format=gray`,
    '-f', 'rawvideo',
    '-'
  ];

  console.log('Running FFmpeg command:', 'ffmpeg', args.join(' '));

  const start = Date.now();
  const proc = spawn('ffmpeg', args);
  let buffer = Buffer.alloc(0);
  let frameCount = 0;

  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= frameSize) {
      buffer = buffer.subarray(frameSize);
      frameCount++;
    }
  });

  proc.on('close', (code) => {
    const duration = (Date.now() - start) / 1000;
    console.log(`Success! Decoded ${frameCount} frames in ${duration}s. Code: ${code}`);
  });
}

testSpeed();
