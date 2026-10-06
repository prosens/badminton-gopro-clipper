/**
 * Badminton GoPro Clipper V2 - Motion Analyzer Unit Test
 * Verifies frame-processing stream pipeline and sample aggregation.
 */

const { analyzeSession } = require('./motion-analyzer');
const path = require('path');
const assert = require('assert');

async function testMotionAnalyzer() {
  console.log('=======================================================');
  console.log('RUNNING MOTION ANALYZER OFFLINE DETECTION UNIT TESTS');
  console.log('=======================================================');

  const mockDir = path.join(__dirname, 'mock_gopro_session');
  const files = [
    { name: 'GH010023.MP4', duration: 10, path: path.join(mockDir, 'GH010023.MP4') },
    { name: 'GH020023.MP4', duration: 10, path: path.join(mockDir, 'GH020023.MP4') },
    { name: 'GH030023.MP4', duration: 10, path: path.join(mockDir, 'GH030023.MP4') }
  ];

  console.log('[TEST 1] Invoking analyzeSession on mock files...');
  // Use interval = 1 to get more samples from short test files
  const result = await analyzeSession(files, 1);

  assert.ok(result, 'Result should not be null');
  assert.ok(Array.isArray(result.samples), 'Result.samples should be an array');
  assert.ok(result.samples.length > 0, 'Should have motion samples');
  console.log(`✓ Samples count: ${result.samples.length}`);
  console.log(`✓ Threshold: ${result.threshold}`);

  // Print first few samples to verify properties exist
  const firstSample = result.samples[0];
  assert.ok(firstSample.time !== undefined, 'Sample should have time');
  assert.ok(firstSample.motion !== undefined, 'Sample should have motion');
  assert.ok(firstSample.smoothed !== undefined, 'Sample should have smoothed');
  assert.ok(firstSample.left !== undefined, 'Sample should have left motion');
  assert.ok(firstSample.right !== undefined, 'Sample should have right motion');
  console.log('✓ Sample structure validated:', firstSample);

  console.log('\n[TEST 2] Invoking analyzeSession with custom crop boundaries...');
  const cropTest = { xStart: 20, xEnd: 80, yStart: 10, yEnd: 90 };
  const resultCrop = await analyzeSession(files, 1, cropTest);
  assert.ok(resultCrop && resultCrop.samples.length > 0, 'Should have samples with crop');
  console.log(`✓ Custom crop query succeeded! Frame count: ${resultCrop.samples.length}`);

  console.log('\n=======================================================');
  console.log('🎉 ALL MOTION ANALYZER UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('=======================================================');
}

testMotionAnalyzer().catch(err => {
  console.error('\n❌ UNIT TEST FAILED:', err);
  process.exit(1);
});
