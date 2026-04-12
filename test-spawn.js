// Browser environment simulation
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;
global.DataView = DataView;
global.Uint8Array = Uint8Array;
global.Uint32Array = Uint32Array;

// Load the engine (Node.js path)
const { createInitialState, tick, ENGINE_VERSION } = require('./engine/core');

// Simulate what the browser does
const serverSeed = 'abc123def456789012345678901234567890abcdef'; // 40 hex chars
const numBalls = 3;
const betPerBall = 5;

const state = createInitialState(serverSeed, numBalls, betPerBall, 15);
console.log('State created, uvsVersion:', state.uvsHeader.uvsVersion);
console.log('serverSeedHash:', state.uvsHeader.serverSeedHash.slice(0,16) + '...');

// Run ticks until first spawn
let spawnTick = null;
for (let i = 0; i < 200 && !state.finished; i++) {
  const events = tick(state, { x: 4.5, y: 2.0 });
  const spawn = events.find(e => e.type === 'spawn');
  if (spawn && !spawnTick) {
    spawnTick = state.tickCount;
    console.log(`First spawn at tick ${spawnTick}:`, JSON.stringify(spawn.ball).slice(0, 80));
  }
}

console.log('After 200 ticks: spawned', state.ballsSpawned, 'balls');
console.log('Spawn happened:', spawnTick !== null ? `tick ${spawnTick}` : 'NO SPAWN');
console.log('Balls on field:', state.balls.length);

if (spawnTick === null) {
  console.log('PROBLEM: No spawn in 200 ticks');
  console.log('tickCount:', state.tickCount);
  console.log('spawnCooldown:', state.spawnCooldown);
  console.log('ballsSpawned:', state.ballsSpawned);
  // Check spawn conditions
  console.log('SPAWN_INTERVAL:', 60);
  console.log('tick % 60 === 0 at ticks:', [60, 120, 180].filter(t => t <= 200));
}
