const { createInitialState, tick, ENGINE_VERSION, sha256Hex, sha512Hex, UVS_PRNG } = require('./engine/core');

console.log('ENGINE_VERSION:', ENGINE_VERSION);

// Test UVS_PRNG with known vectors
const combinedSeed = '446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d11113824954467e8df504de08aa61ce27b0901f6f35a5661c759c6c338f0e817a99';
const rng = new UVS_PRNG(combinedSeed);
const r0 = rng.nextUint32();
console.log('rngCalls[0]:', r0, '(expected 618181213):', r0 === 618181213 ? 'PASS' : 'FAIL');

// Test game state
const state = createInitialState('deadbeeftest', 3);
console.log('sessionId:', state.uvsHeader.sessionId);
console.log('serverSeedHash:', state.uvsHeader.serverSeedHash);
console.log('uvsVersion:', state.uvsHeader.uvsVersion);

// Test tick
const events = tick(state, { x: 4.5, y: 2.0 });
console.log('tick 1 events:', events.length);
console.log('rngCalls consumed:', state.rng.consumed().length);

// Test SHA functions
const h256 = sha256Hex('deadbeefcafebabe0102030405060708090a0b0c0d0e0f101112131415161718');
console.log('sha256 PASS:', h256 === '0dc3c92d4a8b8c6cab67eee53e8177f679e5efa47cce6eb741255466f8dfcf3e');

const h512 = sha512Hex('deadbeefcafebabe0102030405060708090a0b0c0d0e0f101112131415161718:player_seed_42:1');
console.log('sha512 first32:', h512.slice(0,64));
console.log('sha512 PASS:', h512.slice(0,64) === '446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d111');

// Run short game
const state2 = createInitialState('test_server_seed_32bytes_minimum!', 2);
let safety = 0;
while (!state2.finished && safety < 10000) {
  tick(state2, { x: 4.5, y: 2.0 });
  safety++;
}
console.log('Game finished:', state2.finished, 'ticks:', state2.tickCount, 'totalWin:', state2.totalWin);
console.log('ALL OK');
