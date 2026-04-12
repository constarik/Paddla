const { createInitialState, tick } = require('./engine/core');

const serverSeed = 'test_audit_size_estimate_seed_32b';
const numBalls = 100;
const state = createInitialState(serverSeed, numBalls, 5, 500);

let safety = 0;
let totalEvents = 0;
let totalTicks = 0;

while (!state.finished && safety < 500000) {
  const events = tick(state, { x: 4.5, y: 2.0 });
  totalEvents += events.length;
  totalTicks++;
  safety++;
}

// Estimate audit trail entry size
const sampleEntry = {
  step: totalTicks,
  params: { numBalls, betPerBall: 5 },
  input: { target: { x: 4.5, y: 2.0 } },
  output: [{ type: 'goal', prize: 15 }],
  stateHash: 'a'.repeat(64),
  rngCalls: state.rng ? state.rng.consumed() : []
};

const entrySize = JSON.stringify(sampleEntry).length;

console.log(`Ticks          : ${totalTicks}`);
console.log(`Total events   : ${totalEvents}`);
console.log(`Avg events/tick: ${(totalEvents/totalTicks).toFixed(2)}`);
console.log(`Sample entry   : ${entrySize} bytes`);
console.log(`Est. total     : ${(entrySize * totalTicks / 1024).toFixed(1)} KB`);
console.log(`Est. total     : ${(entrySize * totalTicks / 1024 / 1024).toFixed(2)} MB`);

// rngCalls estimate per tick
console.log(`rngCalls/tick  : ${state.rng ? state.rng.consumed().length : 0} (last tick)`);
