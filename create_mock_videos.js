/**
 * Badminton GoPro Clipper - Mock Video Generator
 * Generates 3 short mock video files using FFmpeg's built-in test sources.
 * This allows testing the segmenter/joiner locally without needing large camera files.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetFolder = path.join(__dirname, 'mock_gopro_session');

if (!fs.existsSync(targetFolder)) {
  fs.mkdirSync(targetFolder);
}

console.log(`=======================================================`);
console.log(`Generating mock GoPro video session at:`);
console.log(`${targetFolder}`);
console.log(`=======================================================`);

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function createMockFiles() {
  const filesToCreate = [
    { name: 'GH010023.MP4', duration: 10, color: 'blue' },
    { name: 'GH020023.MP4', duration: 10, color: 'red' },
    { name: 'GH030023.MP4', duration: 10, color: 'green' }
  ];

  for (const item of filesToCreate) {
    const outputPath = path.join(targetFolder, item.name);
    console.log(`Generating ${item.name} (${item.duration}s)...`);
    
    // FFmpeg command to generate a calibration test video with audio
    const cmd = `ffmpeg -y -f lavfi -i color=c=${item.color}:s=640x360:d=${item.duration}:r=30 -f lavfi -i sine=f=440:d=${item.duration} -g 10 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k ${outputPath}`;
    
    try {
      await runCommand(cmd);
      console.log(`✓ Created: ${outputPath}`);
    } catch (err) {
      console.error(`❌ Failed to create ${item.name}:`, err.message);
    }
  }

  console.log(`\n=======================================================`);
  console.log(`Mock files generated successfully!`);
  console.log(`To test the web app:`);
  console.log(`1. Copy this folder path: ${targetFolder}`);
  console.log(`2. Paste it into the search bar in the UI`);
  console.log(`3. Click "Scan Directory"`);
  console.log(`=======================================================`);
}

createMockFiles();
