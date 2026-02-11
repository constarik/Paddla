/**
 * PADDLA Simulation - Baseline RTP test
 * Bumper stays in starting position (no player input)
 */

const { GameEngine } = require('../engine/game.js');
const { CONFIG, BUMPER } = require('../engine/config.js');

const BET = CONFIG.BET_PER_BALL;

// Parse args
const args = process.argv.slice(2);
const numBalls = parseInt(args[0]) || 1000000;
const seed = parseInt(args[1]) || Math.floor(Date.now() / 1000);

console.log('='.repeat(50));
console.log('PADDLA Baseline Simulation');
console.log('='.repeat(50));
console.log(`Balls: ${numBalls.toLocaleString()}`);
console.log(`Seed: ${seed}`);
console.log(`Bumper: stationary at (${BUMPER.START_X}, ${BUMPER.START_Y})`);
console.log('='.repeat(50));

const startTime = Date.now();
let lastReport = startTime;

// Run in chunks for progress reporting
const CHUNK_SIZE = 10000;
let totalBalls = 0;
let totalBet = 0;
let totalWin = 0;
let aggregateStats = {
  ballsFired: 0,
  goals: 0,
  goalsWin: 0,
  golden: 0,
  goldenWin: 0,
  explosions: 0,
  explosionsWin: 0,
  jackpots: 0,
  jackpotsWin: 0,
  collisions: 0,
  collisionsWin: 0,
  recharges: 0,
  timeouts: 0,
  progressiveMax: 1,
  explodedBalls: 0,
  bumperHits: 0
};

let currentSeed = seed;
let ballsRemaining = numBalls;

while (ballsRemaining > 0) {
  const chunkBalls = Math.min(CHUNK_SIZE, ballsRemaining);
  const result = GameEngine.simulate(currentSeed, chunkBalls);
  
  totalBalls += result.stats.ballsFired;
  totalBet += result.stats.ballsFired * BET;
  totalWin += result.totalWin;
  
  // Aggregate stats
  for (const key in aggregateStats) {
    if (key === 'progressiveMax') {
      aggregateStats[key] = Math.max(aggregateStats[key], result.stats[key]);
    } else {
      aggregateStats[key] += result.stats[key];
    }
  }
  
  ballsRemaining -= chunkBalls;
  currentSeed++;
  
  // Progress report every 2 seconds
  const now = Date.now();
  if (now - lastReport > 2000 || ballsRemaining === 0) {
    const pct = ((numBalls - ballsRemaining) / numBalls * 100).toFixed(1);
    const rtp = totalBet > 0 ? (totalWin / totalBet * 100).toFixed(2) : '0.00';
    const elapsed = ((now - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r⏳ ${pct}% | RTP: ${rtp}% | Elapsed: ${elapsed}s    `);
    lastReport = now;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
const rtp = (totalWin / totalBet * 100).toFixed(3);

console.log('\n');
console.log('='.repeat(50));
console.log('RESULTS');
console.log('='.repeat(50));
console.log(`Balls fired:    ${aggregateStats.ballsFired.toLocaleString()}`);
console.log(`Total bet:      $${totalBet.toLocaleString()}`);
console.log(`Total win:      $${Math.round(totalWin).toLocaleString()}`);
console.log(`RTP:            ${rtp}%`);
console.log('-'.repeat(50));
console.log('BREAKDOWN (% of bet)');
console.log('-'.repeat(50));
console.log(`Goals:          ${aggregateStats.goals.toLocaleString()} ($${aggregateStats.goalsWin.toLocaleString()}) = ${(aggregateStats.goalsWin / totalBet * 100).toFixed(2)}%`);
console.log(`  Golden:       ${aggregateStats.golden.toLocaleString()} ($${aggregateStats.goldenWin.toLocaleString()}) = ${(aggregateStats.goldenWin / totalBet * 100).toFixed(2)}%`);
console.log(`  Explosions:   ${aggregateStats.explosions.toLocaleString()} ($${aggregateStats.explosionsWin.toLocaleString()}) = ${(aggregateStats.explosionsWin / totalBet * 100).toFixed(2)}%`);
console.log(`  Jackpots:     ${aggregateStats.jackpots.toLocaleString()} ($${aggregateStats.jackpotsWin.toLocaleString()}) = ${(aggregateStats.jackpotsWin / totalBet * 100).toFixed(2)}%`);
console.log(`Collisions:     ${aggregateStats.collisions.toLocaleString()} ($${aggregateStats.collisionsWin.toLocaleString()}) = ${(aggregateStats.collisionsWin / totalBet * 100).toFixed(2)}%`);
console.log('-'.repeat(50));
console.log('FIELD STATS');
console.log('-'.repeat(50));
console.log(`Recharges:      ${aggregateStats.recharges.toLocaleString()}`);
console.log(`Timeouts:       ${aggregateStats.timeouts.toLocaleString()}`);
console.log(`Bumper hits:    ${aggregateStats.bumperHits.toLocaleString()}`);
console.log(`Max progressive: ×${aggregateStats.progressiveMax}`);
console.log('-'.repeat(50));
console.log(`Elapsed:        ${elapsed}s`);
console.log('='.repeat(50));
