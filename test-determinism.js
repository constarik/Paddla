const { createInitialState, tick } = require('./engine/core');

function runGame(serverSeed, numBalls) {
  const state = createInitialState(serverSeed, numBalls);
  let safety = 0;
  while (!state.finished && safety < 50000) {
    tick(state, { x: 4.5 + Math.sin(state.tickCount * 0.1) * 1.5, y: 2.0 });
    safety++;
  }
  return { ticks: state.tickCount, totalWin: state.totalWin };
}

const SEED = 'test_determinism_seed_paddla_uvs9';
const r1 = runGame(SEED, 5);
const r2 = runGame(SEED, 5);
const r3 = runGame(SEED, 5);

console.log('Run 1:', r1);
console.log('Run 2:', r2);
console.log('Run 3:', r3);
console.log('Determinism PASS:', 
  r1.ticks === r2.ticks && r2.ticks === r3.ticks &&
  r1.totalWin === r2.totalWin && r2.totalWin === r3.totalWin
);
