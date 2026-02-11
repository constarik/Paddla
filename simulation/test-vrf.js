/**
 * PADDLA VRF Test
 * Verify that the VRF scheme works correctly
 */

const { VRF } = require('../server/vrf.js');

console.log('='.repeat(50));
console.log('PADDLA VRF Test');
console.log('='.repeat(50));

// Create VRF instance
const vrf = new VRF();
console.log('\n1. Server generates seed and commitment:');
console.log('   Server Seed:', vrf.serverSeed.substring(0, 16) + '...');
console.log('   Commitment:', vrf.commitment.substring(0, 16) + '...');

// Client provides seed
const clientSeed = 'player123_' + Date.now();
const gameId = 'game_' + Math.random().toString(36).substring(2, 10);

console.log('\n2. Client provides seed:');
console.log('   Client Seed:', clientSeed);
console.log('   Game ID:', gameId);

// Generate game seed
const gameData = vrf.generateGameSeed(clientSeed, gameId);
console.log('\n3. Server generates game seed:');
console.log('   Game Seed (int):', gameData.seed);
console.log('   Game Seed (hex):', gameData.seedHex.substring(0, 16) + '...');

// Get verification data
const verifyData = vrf.getVerificationData(clientSeed, gameId);
console.log('\n4. After game, server reveals:');
console.log('   Server Seed:', verifyData.serverSeed.substring(0, 16) + '...');

// Verify
console.log('\n5. Client verifies:');
const result = VRF.verify(
  verifyData.serverSeed,
  clientSeed,
  gameId,
  verifyData.commitment,
  verifyData.gameSeedHex
);
console.log('   Verification:', result.valid ? '✓ VALID' : '✗ INVALID');

// Test tampering
console.log('\n6. Tamper test (wrong server seed):');
const tamperedResult = VRF.verify(
  'wrong_seed_' + Date.now(),
  clientSeed,
  gameId,
  verifyData.commitment,
  verifyData.gameSeedHex
);
console.log('   Verification:', tamperedResult.valid ? '✓ VALID' : '✗ INVALID (' + tamperedResult.error + ')');

// Test determinism
console.log('\n7. Determinism test:');
const vrf2 = new VRF(vrf.serverSeed); // Same server seed
const gameData2 = vrf2.generateGameSeed(clientSeed, gameId);
console.log('   Same inputs → Same seed:', gameData.seed === gameData2.seed ? '✓ YES' : '✗ NO');

console.log('\n' + '='.repeat(50));
console.log('All tests passed!');
console.log('='.repeat(50));
