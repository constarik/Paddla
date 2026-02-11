// PADDLA Engine v0.4 - Shared between client and server
// Deterministic physics with JavaRandom

const FP_ROUND = 1e10;
function fpRound(v) { return Math.round(v * FP_ROUND) / FP_ROUND; }

class JavaRandom {
  constructor(seed) { 
    this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & 0xFFFFFFFFFFFFn; 
  }
  next(bits) { 
    this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn; 
    return Number(this.seed >> BigInt(48 - bits)); 
  }
  nextDouble() { 
    return (this.next(26) * 0x8000000 + this.next(27)) / 0x20000000000000; 
  }
}

function dist(ax, ay, bx, by) { return Math.sqrt((bx-ax)**2 + (by-ay)**2); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const CONFIG = {
  FIELD: 9, BALL_R: 0.2, SPEED: 0.05, GOAL_R: 1.02,
  CENTER_R: 0.225, CENTER_X: 4.5, CENTER_Y: 4.5, COUNTDOWN: 45,
  GOLDEN_CHANCE: 0.01, EXPLOSIVE_CHANCE: 1/75,
  SPAWN_COOLDOWN: 60, SPAWN_INTERVAL: 60, MAX_ON_FIELD: 10,
  TIMEOUT_LIMIT: 5, PROGRESSIVE_CAP: 5, BET_PER_BALL: 5, MAX_TICKS_PER_BALL: 600
};

const BUMPER = { 
  RADIUS: 0.4, MIN_Y: 0.4, MAX_Y: 3.5, MIN_X: 1.5, MAX_X: 7.5, 
  MAX_SPEED: 0.15, START_X: 4.5, START_Y: 2.0 
};

function isInLeftGoal(b) { return dist(b.x, b.y, 0, 0) < CONFIG.GOAL_R; }
function isInRightGoal(b) { return dist(b.x, b.y, CONFIG.FIELD, 0) < CONFIG.GOAL_R; }
function isGoal(b) { return isInLeftGoal(b) || isInRightGoal(b); }
function isInCenter(b) { return dist(b.x, b.y, CONFIG.CENTER_X, CONFIG.CENTER_Y) < CONFIG.CENTER_R + CONFIG.BALL_R; }
function isInUpperHalf(b) { return b.y < CONFIG.FIELD / 2; }

function createBall(rng, id) {
  const x = 0.5 + rng.nextDouble() * 8, y = CONFIG.FIELD - 0.3;
  const angle = (220 + rng.nextDouble() * 100) * Math.PI / 180;
  const typeRoll = rng.nextDouble();
  let type = 'normal', multiplier = 1;
  if (typeRoll < CONFIG.GOLDEN_CHANCE) { type = 'golden'; multiplier = 3; }
  else if (typeRoll < CONFIG.GOLDEN_CHANCE + CONFIG.EXPLOSIVE_CHANCE) { type = 'explosive'; }
  return { id, x, y, dx: Math.cos(angle) * CONFIG.SPEED, dy: Math.sin(angle) * CONFIG.SPEED, value: 9, ticksSinceCountdown: 0, alive: true, type, multiplier };
}

function randomizeBounce(ball, rng) {
  const angle = Math.atan2(ball.dy, ball.dx) + (rng.nextDouble() - 0.5) * 0.1 * Math.PI;
  const speed = Math.sqrt(ball.dx**2 + ball.dy**2);
  ball.dx = fpRound(Math.cos(angle) * speed);
  ball.dy = fpRound(Math.sin(angle) * speed);
}

function createBumper() { 
  return { x: BUMPER.START_X, y: BUMPER.START_Y, targetX: BUMPER.START_X, targetY: BUMPER.START_Y }; 
}

function moveBumper(bumper) {
  const dx = bumper.targetX - bumper.x, dy = bumper.targetY - bumper.y;
  const d = Math.sqrt(dx*dx + dy*dy);
  if (d > BUMPER.MAX_SPEED) {
    bumper.x = fpRound(bumper.x + (dx/d) * BUMPER.MAX_SPEED);
    bumper.y = fpRound(bumper.y + (dy/d) * BUMPER.MAX_SPEED);
  } else { 
    bumper.x = bumper.targetX; 
    bumper.y = bumper.targetY; 
  }
}

function collideBallBumper(ball, bumper, rng) {
  const d = dist(ball.x, ball.y, bumper.x, bumper.y);
  const minDist = CONFIG.BALL_R + BUMPER.RADIUS;
  if (d < minDist && d > 0) {
    const nx = (ball.x - bumper.x)/d, ny = (ball.y - bumper.y)/d;
    const dot = ball.dx*nx + ball.dy*ny;
    ball.dx = fpRound(ball.dx - 2*dot*nx); 
    ball.dy = fpRound(ball.dy - 2*dot*ny);
    ball.x = fpRound(bumper.x + nx*minDist); 
    ball.y = fpRound(bumper.y + ny*minDist);
    randomizeBounce(ball, rng);
    return true;
  }
  return false;
}

function createInitialState(seed, numBalls) {
  return { 
    rng: new JavaRandom(seed), 
    seed, 
    balls: [], 
    bumper: createBumper(), 
    tickCount: 0, 
    ballsSpawned: 0, 
    numBalls, 
    spawnCooldown: 0, 
    progressive: 1, 
    timeoutCount: 0, 
    totalWin: 0, 
    finished: false, 
    nextBallId: 1
  };
}

function tick(state, bumperTarget) {
  if (state.finished) return [];
  
  state.tickCount++;
  if (state.spawnCooldown > 0) state.spawnCooldown--;

  // Apply bumper input
  if (bumperTarget) {
    state.bumper.targetX = clamp(bumperTarget.x, BUMPER.MIN_X, BUMPER.MAX_X);
    state.bumper.targetY = clamp(bumperTarget.y, BUMPER.MIN_Y, BUMPER.MAX_Y);
  }
  moveBumper(state.bumper);

  // Spawn
  if (state.tickCount % CONFIG.SPAWN_INTERVAL === 0 && state.balls.length < CONFIG.MAX_ON_FIELD && 
      state.spawnCooldown <= 0 && state.ballsSpawned < state.numBalls) {
    const ball = createBall(state.rng, state.nextBallId++);
    state.balls.push(ball); 
    state.ballsSpawned++; 
    state.spawnCooldown = CONFIG.SPAWN_COOLDOWN;
  }

  // Update balls
  for (const b of state.balls) {
    if (!b.alive) continue;
    b.ticksSinceCountdown++;
    b.x = fpRound(b.x + b.dx); 
    b.y = fpRound(b.y + b.dy);
    const R = CONFIG.BALL_R, F = CONFIG.FIELD;
    if (b.x - R < 0) { b.x = R; b.dx = -b.dx; }
    if (b.x + R > F) { b.x = F - R; b.dx = -b.dx; }
    if (b.y - R < 0) { b.y = R; b.dy = -b.dy; }
    if (b.y + R > F) { b.y = F - R; b.dy = -b.dy; }
    if (b.type === 'normal' && b.ticksSinceCountdown >= CONFIG.COUNTDOWN && b.value > 0) {
      b.value--; 
      b.ticksSinceCountdown = 0;
      if (b.value <= 0) { b.alive = false; b.diedFromTimeout = true; }
    }
    if (b.alive && (b.x - R < 0.01 || b.x + R > F - 0.01 || b.y - R < 0.01 || b.y + R > F - 0.01)) {
      randomizeBounce(b, state.rng);
    }
  }

  // Bumper collision
  for (const b of state.balls) {
    if (b.alive) collideBallBumper(b, state.bumper, state.rng);
  }

  // Center recharge
  for (const b of state.balls) {
    if (b.alive && isInCenter(b)) {
      const dx = b.x - CONFIG.CENTER_X, dy = b.y - CONFIG.CENTER_Y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > 0) { 
        b.dx = (dx/d)*CONFIG.SPEED; 
        b.dy = (dy/d)*CONFIG.SPEED; 
        randomizeBounce(b, state.rng); 
      }
      if (b.type === 'normal' && b.value < 9) { 
        b.value = 9; 
        b.ticksSinceCountdown = 0; 
      }
    }
  }

  // Goals
  for (const ball of state.balls) {
    if (!ball.alive) continue;
    if (isGoal(ball)) {
      const prize = ball.value * ball.multiplier * state.progressive;
      state.totalWin += prize;
      if (ball.type === 'golden') state.timeoutCount = 0;
      if (state.progressive < CONFIG.PROGRESSIVE_CAP) state.progressive++;
      ball.alive = false;
      
      // Explosive
      if (ball.type === 'explosive') {
        state.timeoutCount = 0;
        for (const o of state.balls) {
          if (o.alive && o.id !== ball.id && isInUpperHalf(o)) {
            const ep = o.value * o.multiplier * state.progressive;
            state.totalWin += ep;
            if (state.progressive < CONFIG.PROGRESSIVE_CAP) state.progressive++;
            o.alive = false;
          }
        }
      }
    }
  }

  // Ball-ball collisions
  for (let i = 0; i < state.balls.length; i++) {
    for (let j = i + 1; j < state.balls.length; j++) {
      const b1 = state.balls[i], b2 = state.balls[j];
      if (!b1.alive || !b2.alive) continue;
      if (dist(b1.x, b1.y, b2.x, b2.y) < CONFIG.BALL_R * 2) {
        const s1 = b1.type !== 'normal', s2 = b2.type !== 'normal';
        if (s1 && s2) {
          const dx = b2.x - b1.x, dy = b2.y - b1.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
          const nx = dx/d, ny = dy/d, ov = CONFIG.BALL_R*2 - d;
          if (ov > 0) { b1.x -= nx*ov*0.5; b1.y -= ny*ov*0.5; b2.x += nx*ov*0.5; b2.y += ny*ov*0.5; }
          b1.dx = -nx*CONFIG.SPEED; b1.dy = -ny*CONFIG.SPEED;
          b2.dx = nx*CONFIG.SPEED; b2.dy = ny*CONFIG.SPEED;
          randomizeBounce(b1, state.rng); randomizeBounce(b2, state.rng);
          continue;
        }
        if (s1) { b2.alive = false; state.totalWin += 1; continue; }
        if (s2) { b1.alive = false; state.totalWin += 1; continue; }
        
        // Double
        if (b1.value === b2.value) {
          state.totalWin += b1.value * 2;
          if (state.rng.nextDouble() < 0.5) b2.alive = false; else b1.alive = false;
        } else {
          state.totalWin += 1;
          const loser = b1.value < b2.value ? b1 : b2, winner = b1.value < b2.value ? b2 : b1;
          loser.alive = false;
          const dx = winner.x - loser.x, dy = winner.y - loser.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
          winner.dx = (dx/d)*CONFIG.SPEED; winner.dy = (dy/d)*CONFIG.SPEED;
          randomizeBounce(winner, state.rng);
        }
      }
    }
  }

  // Timeouts
  for (const b of state.balls) {
    if (!b.alive && b.diedFromTimeout) {
      state.timeoutCount++;
      if (state.timeoutCount >= CONFIG.TIMEOUT_LIMIT) {
        state.progressive = 1; 
        state.timeoutCount = 0;
      }
      b.diedFromTimeout = false;
    }
  }

  state.balls = state.balls.filter(b => b.alive);

  // Auto-collect special balls if no normal balls left
  if (state.balls.length > 0 && !state.balls.some(b => b.type === 'normal')) {
    for (const b of state.balls) {
      if (b.alive) {
        state.totalWin += b.value * b.multiplier * state.progressive;
        if (state.progressive < CONFIG.PROGRESSIVE_CAP) state.progressive++;
        b.alive = false;
      }
    }
    state.balls = [];
  }

  // End condition
  if (state.ballsSpawned >= state.numBalls && state.balls.length === 0) {
    state.finished = true;
  }
}

// Replay a chunk of inputs
async function replayChunk(state, inputLog) {
  return new Promise(resolve => {
    let i = 0;
    
    function processBatch() {
      const end = Math.min(i + 500, inputLog.length);
      while (i < end) {
        const input = inputLog[i++];
        // Each input corresponds to exactly one tick
        // Apply target and run tick
        tick(state, input.target);
      }
      if (i < inputLog.length) {
        setImmediate(processBatch);
      } else {
        // Store final target in state for finishGame
        if (inputLog.length > 0) {
          const lastInput = inputLog[inputLog.length - 1];
          state.bumper.targetX = lastInput.target.x;
          state.bumper.targetY = lastInput.target.y;
        }
        resolve();
      }
    }
    processBatch();
  });
}

// Finish game - run remaining ticks until game ends
function finishGame(state) {
  const target = { x: state.bumper.targetX, y: state.bumper.targetY };
  let safety = 0;
  while (!state.finished && safety < 100000) {
    tick(state, target);
    safety++;
  }
}

module.exports = {
  CONFIG,
  BUMPER,
  JavaRandom,
  createInitialState,
  tick,
  replayChunk,
  finishGame,
  clamp
};
