const assert = require('assert');

async function testProfilesAPI() {
  console.log('=======================================================');
  console.log('RUNNING BACKEND PROFILES API INTEGRATION TESTS');
  console.log('=======================================================');

  const BASE_URL = 'http://localhost:4000';

  // 1. Fetch initial profiles
  console.log('[TEST 1] Fetching initial profiles list...');
  const res1 = await fetch(`${BASE_URL}/api/youtube-profiles`);
  const data1 = await res1.json();
  console.log(`✓ Profiles found: ${data1.profiles.length}`);
  
  // Clean up any existing profiles if present from previous manual actions
  for (const p of data1.profiles) {
    console.log(`[CLEANUP] Deleting profile ${p.id}...`);
    await fetch(`${BASE_URL}/api/youtube-profiles/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id })
    });
  }

  // 2. Create mock profile
  console.log('\n[TEST 2] Creating custom simulation profile...');
  const mockName = 'Court Conquest Masters';
  const res2 = await fetch(`${BASE_URL}/api/youtube-profiles/create-mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: mockName })
  });
  const data2 = await res2.json();
  assert.ok(data2.success);
  assert.equal(data2.profile.name, mockName);
  console.log(`✓ Simulation profile created successfully: "${data2.profile.name}" (ID: ${data2.profile.id})`);
  const newProfileId = data2.profile.id;

  // 3. Fetch profiles to check active
  console.log('\n[TEST 3] Verifying profile is active globally...');
  const res3 = await fetch(`${BASE_URL}/api/youtube-profiles`);
  const data3 = await res3.json();
  assert.equal(data3.profiles.length, 1);
  assert.equal(data3.activeProfileId, newProfileId);
  console.log(`✓ Active Profile ID matches newly created profile!`);

  // 4. Test YouTube channels simulation fallback for mock profile
  console.log('\n[TEST 4] Fetching simulated channels list...');
  const res4 = await fetch(`${BASE_URL}/api/youtube-channels`);
  const data4 = await res4.json();
  assert.ok(data4.success);
  assert.ok(data4.channels.length > 0);
  assert.equal(data4.channels[0].name, mockName);
  console.log(`✓ Channels endpoint returned simulation channel matching profile name: "${data4.channels[0].name}"`);

  // 5. Test switching to offline mode
  console.log('\n[TEST 5] Switching active profile to Offline / Simulation Mode...');
  const res5 = await fetch(`${BASE_URL}/api/youtube-profiles/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'offline' })
  });
  const data5 = await res5.json();
  assert.ok(data5.success);

  const res5Check = await fetch(`${BASE_URL}/api/youtube-profiles`);
  const data5Check = await res5Check.json();
  assert.equal(data5Check.activeProfileId, null);
  console.log('✓ activeProfileId successfully reset to null (offline).');

  // 6. Test deleting the profile
  console.log('\n[TEST 6] Deleting the profile...');
  const res6 = await fetch(`${BASE_URL}/api/youtube-profiles/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: newProfileId })
  });
  const data6 = await res6.json();
  assert.ok(data6.success);

  const res6Check = await fetch(`${BASE_URL}/api/youtube-profiles`);
  const data6Check = await res6Check.json();
  assert.equal(data6Check.profiles.length, 0);
  console.log('✓ Profile deleted. Profiles list is now empty.');

  console.log('\n=======================================================');
  console.log('🎉 ALL BACKEND PROFILE API INTEGRATION TESTS PASSED!');
  console.log('=======================================================');
}

testProfilesAPI().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
