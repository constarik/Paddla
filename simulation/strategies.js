/**
 * PADDLA Simulation - AI Strategies v0.2
 * Synced with client/index.html
 */

const { JavaRandom, fpRound, dist, clamp } = require('../engine/core.js');
const { CONFIG, BUMPER } = require('../engine/config.js');
const { GameEngine } = require('../engine/game.js');

const BET = CONFIG.BET_PER_BALL;

// ==================== AI STRATEGIES ====================

// Sticky targets for strategies
let hunterTargetId = null;
let defenderTargetId = null;
let sniperTargetId = null;

function resetTargets() {
  hunterTargetId = null;
  defenderTargetId = null;
  sniperTargetId = null;
}

// Strategy 1: Stationary (baseline)
function strategyStationary(state) {
  return { x: BUMPER.START_X, y: BUMPER.START_Y };
}

// Strategy 2: Hunter - follows balls, positions BELOW to deflect UP
function strategyHunter(state) {
  // Check if current target still valid (in upper half, alive)
  let target = state.balls.find(b => b.id === hunterTargetId && b.alive && b.y < CONFIG.FIELD / 2);
  
  // Find new target - prioritize balls heading up (toward goals)
  if (!target) {
    let bestScore = -Infinity;
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      if (ball.y > CONFIG.FIELD / 2) continue; // only upper half
      // Score: prefer balls heading up (dy < 0) and high value
      const headingUp = ball.dy < 0 ? 1 : 0;
      const score = headingUp * 100 + ball.value * 10 - ball.y;
      if (score > bestScore) {
        bestScore = score;
        target = ball;
      }
    }
    hunterTargetId = target ? target.id : null;
  }
  
  if (target) {
    // Position BELOW the ball to deflect it UP toward goals
    const targetY = clamp(target.y + 0.8, BUMPER.MIN_Y, BUMPER.MAX_Y);
    return { x: clamp(target.x, BUMPER.MIN_X, BUMPER.MAX_X), y: targetY };
  }
  // Default: patrol at bottom of zone
  return { x: BUMPER.START_X, y: BUMPER.MAX_Y - 0.5 };
}

// Strategy 3: Defender - blocks balls heading away from goals
function strategyDefender(state) {
  // Check if current target is still valid (alive, in zone, heading down)
  let target = state.balls.find(b => b.id === defenderTargetId && b.alive && b.y < CONFIG.FIELD / 2 && b.dy > 0);
  
  // Find new target if needed
  if (!target) {
    let bestScore = -Infinity;
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      const headingDown = ball.dy > 0;
      const inUpperZone = ball.y < CONFIG.FIELD / 2;
      const value = ball.value * ball.multiplier;
      if (headingDown && inUpperZone) {
        const score = value * 10 + (CONFIG.FIELD / 2 - ball.y);
        if (score > bestScore) { bestScore = score; target = ball; }
      }
    }
    defenderTargetId = target ? target.id : null;
  }
  
  if (target) {
    return { x: clamp(target.x, BUMPER.MIN_X, BUMPER.MAX_X), y: clamp(target.y + 0.8, BUMPER.MIN_Y, BUMPER.MAX_Y) };
  }
  return { x: 4.5, y: 2.5 };
}

// Strategy 4: Sniper - directs balls toward nearest goal
function strategySniper(state) {
  // Check if current target is still valid
  let target = state.balls.find(b => b.id === sniperTargetId && b.alive && b.y < CONFIG.FIELD / 2);
  
  // Find new target if needed
  if (!target) {
    let bestScore = -Infinity;
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      const inZone = ball.y < CONFIG.FIELD / 2;
      const value = ball.value * ball.multiplier;
      if (inZone) {
        const score = value * 10 - ball.y;
        if (score > bestScore) { bestScore = score; target = ball; }
      }
    }
    sniperTargetId = target ? target.id : null;
  }
  
  if (target) {
    const offsetX = target.x < 4.5 ? 0.5 : -0.5;
    return { x: clamp(target.x + offsetX, BUMPER.MIN_X, BUMPER.MAX_X), y: clamp(target.y + 0.3, BUMPER.MIN_Y, BUMPER.MAX_Y) };
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

// Strategy 6: Avoider - runs away from balls
function strategyAvoider(state) {
  let avgX = 0, avgY = 0, count = 0;
  for (const ball of state.balls) {
    if (!ball.alive || ball.y >= CONFIG.FIELD / 2) continue;
    avgX += ball.x; avgY += ball.y; count++;
  }
  if (count > 0) {
    avgX /= count; avgY /= count;
    const awayX = state.bumper.x + (state.bumper.x - avgX) * 0.5;
    const awayY = state.bumper.y + (state.bumper.y - avgY) * 0.5;
    return { x: clamp(awayX, BUMPER.MIN_X, BUMPER.MAX_X), y: clamp(awayY, BUMPER.MIN_Y, BUMPER.MAX_Y) };
  }
  return { x: BUMPER.START_X, y: BUMPER.START_Y };
}

// ==================== SIMULATION ====================

function simulateWithStrategy(seed, numBalls, strategyFn, strategyName) {
  resetTargets();
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
