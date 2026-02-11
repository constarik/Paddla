/**
 * PADDLA Simulation - AI Strategies
 * Compare different bumper control strategies
 * v0.2 - Bumper in upper zone (near goals)
 */

const { JavaRandom, fpRound, dist, clamp } = require('../engine/core.js');
const { CONFIG, BUMPER } = require('../engine/config.js');
const { GameEngine } = require('../engine/game.js');

const BET = CONFIG.BET_PER_BALL;

// ==================== AI STRATEGIES ====================

// Strategy 1: Stationary (baseline)
function strategyStationary(state) {
  return { x: BUMPER.START_X, y: BUMPER.START_Y };
}

// Strategy 2: Follow nearest ball in upper half (approaching goals)
function strategyHunter(state) {
  let nearest = null;
  let minDist = Infinity;
  
  for (const ball of state.balls) {
    if (!ball.alive) continue;
    // Only chase balls in upper half heading toward goals
    if (ball.y > CONFIG.FIELD / 2) continue;
    
    const d = dist(ball.x, ball.y, state.bumper.x, state.bumper.y);
    // Don't get too close - maintain minimum distance to avoid sticking
    if (d < minDist && d > BUMPER.RADIUS + CONFIG.BALL_R + 0.5) {
      minDist = d;
      nearest = ball;
    }
  }
  
  if (nearest) {
    // Position to deflect, not to intercept directly
    const targetX = clamp(nearest.x, BUMPER.MIN_X, BUMPER.MAX_X);
    const targetY = clamp(nearest.y + 0.5, BUMPER.MIN_Y, BUMPER.MAX_Y);
    return { x: targetX, y: targetY };
  }
  return { x: BUMPER.START_X, y: BUMPER.START_Y };
}

// Strategy 3: Block balls from escaping (keep them in goal zone)
function strategyDefender(state) {
  let target = null;
  let bestScore = -Infinity;
  
  for (const ball of state.balls) {
    if (!ball.alive) continue;
    
    // Find balls heading away from goals (dy > 0 means going down)
    const headingDown = ball.dy > 0;
    const inUpperZone = ball.y < CONFIG.FIELD / 2;
    const value = ball.value * ball.multiplier;
    
    if (headingDown && inUpperZone) {
      const score = value * 10 + (CONFIG.FIELD / 2 - ball.y);
      if (score > bestScore) {
        bestScore = score;
        target = ball;
      }
    }
  }
  
  if (target) {
    // Position below the ball to bounce it back up
    const targetX = clamp(target.x, BUMPER.MIN_X, BUMPER.MAX_X);
    const targetY = clamp(target.y + 0.8, BUMPER.MIN_Y, BUMPER.MAX_Y);
    return { x: targetX, y: targetY };
  }
  
  // Default: patrol center
  return { x: 4.5, y: 2.5 };
}

// Strategy 4: Direct balls toward nearest goal
function strategySniper(state) {
  let target = null;
  let bestScore = -Infinity;
  
  for (const ball of state.balls) {
    if (!ball.alive) continue;
    
    // Prioritize high-value balls in upper half
    const inZone = ball.y < CONFIG.FIELD / 2;
    const value = ball.value * ball.multiplier;
    
    if (inZone) {
      // Higher value + higher position = better target
      const score = value * 10 - ball.y;
      if (score > bestScore) {
        bestScore = score;
        target = ball;
      }
    }
  }
  
  if (target) {
    // Determine nearest goal
    const goalX = target.x < 4.5 ? 0 : 9;
    
    // Position to deflect ball toward goal
    // If ball is left of center, position to its right to push left
    // If ball is right of center, position to its left to push right
    const offsetX = target.x < 4.5 ? 0.5 : -0.5;
    const targetX = clamp(target.x + offsetX, BUMPER.MIN_X, BUMPER.MAX_X);
    const targetY = clamp(target.y + 0.3, BUMPER.MIN_Y, BUMPER.MAX_Y);
    
    return { x: targetX, y: targetY };
  }
  
  return { x: 4.5, y: 2.0 };
}

// Strategy 5: Random movement
function strategyRandom(state, rng) {
  if (state.tickCount % 30 === 0) {
    return {
      x: BUMPER.MIN_X + rng.nextDouble() * (BUMPER.MAX_X - BUMPER.MIN_X),
      y: BUMPER.MIN_Y + rng.nextDouble() * (BUMPER.MAX_Y - BUMPER.MIN_Y)
    };
  }
  return { x: state.bumper.targetX, y: state.bumper.targetY };
}

// Strategy 6: Avoid all balls (worst case - pure chaos)
function strategyAvoider(state) {
  let avgX = 0, avgY = 0, count = 0;
  
  for (const ball of state.balls) {
    if (!ball.alive) continue;
    if (ball.y < CONFIG.FIELD / 2) {
      avgX += ball.x;
      avgY += ball.y;
      count++;
    }
  }
  
  if (count > 0) {
    avgX /= count;
    avgY /= count;
    // Move away from average ball position
    const awayX = state.bumper.x + (state.bumper.x - avgX) * 0.5;
    const awayY = state.bumper.y + (state.bumper.y - avgY) * 0.5;
    return {
      x: clamp(awayX, BUMPER.MIN_X, BUMPER.MAX_X),
      y: clamp(awayY, BUMPER.MIN_Y, BUMPER.MAX_Y)
    };
  }
  
  return { x: BUMPER.START_X, y: BUMPER.START_Y };
}

// ==================== SIMULATION ====================

function simulateWithStrategy(seed, numBalls, strategyFn, strategyName) {
  let state = GameEngine.createInitialState(seed, numBalls);
  const strategyRng = new JavaRandom(seed + 999999);
  let ticks = 0;
  const maxTicks = numBalls * CONFIG.MAX_TICKS_PER_BALL;
  
  while (!state.finished && ticks < maxTicks) {
    // Get AI target
    const target = strategyFn(state, strategyRng);
    
    // Set input
    state.bumper.targetX = clamp(target.x, BUMPER.MIN_X, BUMPER.MAX_X);
    state.bumper.targetY = clamp(target.y, BUMPER.MIN_Y, BUMPER.MAX_Y);
    
    // Tick
    const result = GameEngine.tick(state);
    state = result.state;
    ticks++;
  }
  
  return {
    strategy: strategyName,
    seed,
    numBalls,
    ticks,
    totalWin: state.totalWin,
    stats: state.stats
  };
}

// ==================== MAIN ====================

const args = process.argv.slice(2);
const numBalls = parseInt(args[0]) || 100000;
const baseSeed = parseInt(args[1]) || Math.floor(Date.now() / 1000);

const strategies = [
  { name: 'Stationary', fn: strategyStationary },
  { name: 'Hunter', fn: strategyHunter },
  { name: 'Defender', fn: strategyDefender },
  { name: 'Sniper', fn: strategySniper },
  { name: 'Random', fn: strategyRandom },
  { name: 'Avoider', fn: strategyAvoider }
];

console.log('='.repeat(60));
console.log('PADDLA AI Strategy Comparison v0.2');
console.log('Bumper zone: upper field (y: ' + BUMPER.MIN_Y + ' - ' + BUMPER.MAX_Y + ')');
console.log('='.repeat(60));
console.log(`Balls per strategy: ${numBalls.toLocaleString()}`);
console.log(`Base seed: ${baseSeed}`);
console.log('='.repeat(60));

const results = [];

for (const strategy of strategies) {
  const startTime = Date.now();
  process.stdout.write(`Running ${strategy.name.padEnd(12)}... `);
  
  const result = simulateWithStrategy(baseSeed, numBalls, strategy.fn, strategy.name);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const bet = result.stats.ballsFired * BET;
  const rtp = (result.totalWin / bet * 100).toFixed(2);
  
  results.push({
    ...result,
    bet,
    rtp: parseFloat(rtp),
    elapsed
  });
  
  console.log(`RTP: ${rtp}% (${elapsed}s)`);
}

console.log('\n' + '='.repeat(60));
console.log('COMPARISON');
console.log('='.repeat(60));
console.log('Strategy     | RTP      | Goals   | Timeouts | Bumper Hits');
console.log('-'.repeat(60));

for (const r of results) {
  const name = r.strategy.padEnd(12);
  const rtp = (r.rtp.toFixed(2) + '%').padStart(7);
  const goals = r.stats.goals.toLocaleString().padStart(7);
  const timeouts = r.stats.timeouts.toLocaleString().padStart(8);
  const bumperHits = r.stats.bumperHits.toLocaleString().padStart(11);
  console.log(`${name} | ${rtp} | ${goals} | ${timeouts} | ${bumperHits}`);
}

console.log('-'.repeat(60));

// Sort by RTP
results.sort((a, b) => b.rtp - a.rtp);
const best = results[0];
const worst = results[results.length - 1];
const range = best.rtp - worst.rtp;

console.log(`\nBest:  ${best.strategy} (${best.rtp}%)`);
console.log(`Worst: ${worst.strategy} (${worst.rtp}%)`);
console.log(`Range: ${range.toFixed(2)}% (player skill impact)`);
console.log('='.repeat(60));
