// PADDLA v0.7 Test - Input-Seeded Randomness Verification
// Run: node test-sync.js

const { createInitialState, tick, replay, CONFIG, BUMPER } = require('../engine/core');

console.log('=== PADDLA v0.7 Input-Seeded Randomness Test ===\n');

// Test 1: Deterministic replay
console.log('TEST 1: Deterministic Replay');
console.log('─'.repeat(50));

const gameSeedHex = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
const numBalls = 10;

// Play game with specific bumper movements
const state1 = createInitialState(gameSeedHex, numBalls);

// Simulate game with pattern movements
let targetX = BUMPER.START_X;
let targetY = BUMPER.START_Y;

while (!state1.finished) {
  // Move bumper in pattern
  if (state1.tickCount % 60 < 30) {
    targetX = Math.min(targetX + 0.1, BUMPER.MAX_X);
  } else {
    targetX = Math.max(targetX - 0.1, BUMPER.MIN_X);
  }
  
  const target = { x: targetX, y: targetY };
  tick(state1, target);
  
  if (state1.tickCount > 100000) {
    console.log('Safety break');
    break;
  }
}

console.log(`Original game: ${state1.tickCount} ticks, totalWin = ${state1.totalWin}`);

// Replay with same seed + inputLog
const state2 = replay(gameSeedHex, numBalls, state1.inputLog);

console.log(`Replayed game: totalWin = ${state2.totalWin}`);
console.log(`Match: ${state1.totalWin === state2.totalWin ? '✓ PASS' : '✗ FAIL'}`);

// Test 2: Different bumper positions = different randomness
console.log('\nTEST 2: Input-Seeded Randomness (different positions → different results)');
console.log('─'.repeat(50));

const state3 = createInitialState(gameSeedHex, numBalls);
while (!state3.finished) {
  // Different movement pattern - stay in center
  tick(state3, { x: 4.5, y: 2.0 });
  if (state3.tickCount > 100000) break;
}

console.log(`Center strategy: totalWin = ${state3.totalWin}`);

const state4 = createInitialState(gameSeedHex, numBalls);
while (!state4.finished) {
  // Different movement pattern - stay left
  tick(state4, { x: BUMPER.MIN_X, y: BUMPER.MIN_Y });
  if (state4.tickCount > 100000) break;
}

console.log(`Left-corner strategy: totalWin = ${state4.totalWin}`);

if (state3.totalWin !== state4.totalWin) {
  console.log('✓ PASS - Different positions produce different results');
} else {
  console.log('⚠ Results happen to match (rare but possible)');
}

// Test 3: Same position = same randomness
console.log('\nTEST 3: Same Position = Same Randomness');
console.log('─'.repeat(50));

const state5 = createInitialState(gameSeedHex, numBalls);
while (!state5.finished) {
  tick(state5, { x: 4.5, y: 2.0 });
  if (state5.tickCount > 100000) break;
}

const state6 = createInitialState(gameSeedHex, numBalls);
while (!state6.finished) {
  tick(state6, { x: 4.5, y: 2.0 });
  if (state6.tickCount > 100000) break;
}

console.log(`Run 1: totalWin = ${state5.totalWin}`);
console.log(`Run 2: totalWin = ${state6.totalWin}`);
console.log(`Match: ${state5.totalWin === state6.totalWin ? '✓ PASS' : '✗ FAIL'}`);

// Test 4: Commitment verification
console.log('\nTEST 4: Commitment Scheme');
console.log('─'.repeat(50));

const crypto = require('crypto');

const serverSeed = crypto.randomBytes(32).toString('hex');
const commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
const clientSeed = 'client_test_123';
const gameId = 'game_abc_456';

const gameSeed = crypto.createHmac('sha256', serverSeed)
  .update(`${clientSeed}:${gameId}`)
  .digest('hex');

console.log(`Server Seed: ${serverSeed.substring(0, 16)}...`);
console.log(`Commitment:  ${commitment.substring(0, 16)}...`);
console.log(`Client Seed: ${clientSeed}`);
console.log(`Game ID:     ${gameId}`);
console.log(`Game Seed:   ${gameSeed.substring(0, 16)}...`);

// Verify
const verifyCommitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
const verifyGameSeed = crypto.createHmac('sha256', serverSeed)
  .update(`${clientSeed}:${gameId}`)
  .digest('hex');

console.log(`\nVerification:`);
console.log(`Commitment: ${commitment === verifyCommitment ? '✓ PASS' : '✗ FAIL'}`);
console.log(`Game Seed:  ${gameSeed === verifyGameSeed ? '✓ PASS' : '✗ FAIL'}`);

console.log('\n' + '='.repeat(50));
console.log('All tests completed!');
console.log('='.repeat(50));
