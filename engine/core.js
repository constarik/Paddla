// PADDLA Engine v8 - Input-Seeded Randomness (Provably Fair)
// Every random call depends on game seed + tick + bumper position
// This prevents prediction: player can't know future randomness without committing to bumper position

const ENGINE_VERSION = 8;

const crypto = typeof window === 'undefined' ? require('crypto') : null;

// ===== PURE JS SHA256 (for browser sync) =====
// Minimal implementation for HMAC-SHA256

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256Pure(message) {
  const bytes = typeof message === 'string' 
    ? new TextEncoder().encode(message) 
    : new Uint8Array(message);
  
  // Pre-processing
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 4, bitLen, false);
  
  // Initial hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  
  const w = new Uint32Array(64);
  
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i-15] >>> 7) | (w[i-15] << 25)) ^ ((w[i-15] >>> 18) | (w[i-15] << 14)) ^ (w[i-15] >>> 3);
      const s1 = ((w[i-2] >>> 17) | (w[i-2] << 15)) ^ ((w[i-2] >>> 19) | (w[i-2] << 13)) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  
  const result = new Uint8Array(32);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, false); rv.setUint32(4, h1, false);
  rv.setUint32(8, h2, false); rv.setUint32(12, h3, false);
  rv.setUint32(16, h4, false); rv.setUint32(20, h5, false);
  rv.setUint32(24, h6, false); rv.setUint32(28, h7, false);
  return result;
}

function hmacSha256Pure(key, message) {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : new Uint8Array(key);
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : new Uint8Array(message);
  
  // Key padding
  let keyPad = keyBytes;
  if (keyBytes.length > 64) {
    keyPad = sha256Pure(keyBytes);
  }
  if (keyPad.length < 64) {
    const tmp = new Uint8Array(64);
    tmp.set(keyPad);
    keyPad = tmp;
  }
  
  // Inner and outer padding
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = keyPad[i] ^ 0x36;
    opad[i] = keyPad[i] ^ 0x5c;
  }
  
  // Inner hash
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, 64);
  const innerHash = sha256Pure(inner);
  
  // Outer hash
  const outer = new Uint8Array(64 + 32);
  outer.set(opad);
  outer.set(innerHash, 64);
  return sha256Pure(outer);
}

// ===== UTILITIES =====

const FP_ROUND = 1e10;
function fpRound(v) { return Math.round(v * FP_ROUND) / FP_ROUND; }
function dist(ax, ay, bx, by) { return Math.sqrt((bx-ax)**2 + (by-ay)**2); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Convert first 8 bytes of hash to double [0, 1)
function bytesToDouble(bytes) {
  const view = new DataView(bytes.buffer || new Uint8Array(bytes).buffer);
  const high = view.getUint32(0, false) >>> 0;
  const low = view.getUint32(4, false) >>> 0;
  return (high * 0x100000000 + low) / 0x10000000000000000;
}

// Convert bytes to hex string
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== INPUT-SEEDED RNG =====

class InputSeededRNG {
  constructor(gameSeedHex) {
    this.gameSeedHex = gameSeedHex;
    this.currentTick = -1;
    this.bumperX = 0;
    this.bumperY = 0;
    this.counter = 0;
  }

  setTickContext(tick, bumperX, bumperY) {
    if (this.currentTick !== tick || this.bumperX !== bumperX || this.bumperY !== bumperY) {
      this.currentTick = tick;
      this.bumperX = bumperX;
      this.bumperY = bumperY;
      this.counter = 0;
    }
  }

  _makeInput(eventType) {
    return `${this.currentTick}:${this.bumperX.toFixed(4)}:${this.bumperY.toFixed(4)}:${eventType}:${this.counter++}`;
  }

  // Sync random - works everywhere
  nextDouble(eventType = 'rnd') {
    const input = this._makeInput(eventType);
    const hash = hmacSha256Pure(this.gameSeedHex, input);
    return bytesToDouble(hash);
  }
  
  // Alias for compatibility
  nextDoubleSync(eventType) {
    return this.nextDouble(eventType);
  }
}

// ===== CONFIG =====

const CONFIG = {
  FIELD: 9, 
  BALL_R: 0.2, 
  SPEED: 0.05, 
  GOAL_R: 1.02,
  CENTER_R: 0.225, 
  CENTER_X: 4.5, 
  CENTER_Y: 4.5, 
  COUNTDOWN: 45,
  GOLDEN_CHANCE: 0.01, 
  EXPLOSIVE_CHANCE: 1/75,
  SPAWN_COOLDOWN: 60, 
  SPAWN_INTERVAL: 60, 
  MAX_ON_FIELD: 10,
  TIMEOUT_LIMIT: 5, 
  PROGRESSIVE_CAP: 5, 
  BET_PER_BALL: 5, 
  MAX_TICKS_PER_BALL: 600
};

const BUMPER = { 
  RADIUS: 0.4, 
  MIN_Y: 0.4, 
  MAX_Y: 3.5, 
  MIN_X: 1.5, 
  MAX_X: 7.5, 
  MAX_SPEED: 0.15, 
  START_X: 4.5, 
  START_Y: 2.0 
};

// ===== HELPERS =====

function isInLeftGoal(b) { return dist(b.x, b.y, 0, 0) < CONFIG.GOAL_R; }
function isInRightGoal(b) { return dist(b.x, b.y, CONFIG.FIELD, 0) < CONFIG.GOAL_R; }
function isGoal(b) { return isInLeftGoal(b) || isInRightGoal(b); }
function isInCenter(b) { return dist(b.x, b.y, CONFIG.CENTER_X, CONFIG.CENTER_Y) < CONFIG.CENTER_R + CONFIG.BALL_R; }
function isInUpperHalf(b) { return b.y < CONFIG.FIELD / 2; }

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

// ===== BALL CREATION =====

function createBall(rng, id) {
  const x = 0.5 + rng.nextDouble('spawn_x') * 8;
  const y = CONFIG.FIELD - 0.3;
  const angle = (220 + rng.nextDouble('spawn_angle') * 100) * Math.PI / 180;
  const typeRoll = rng.nextDouble('spawn_type');
  
  let type = 'normal', multiplier = 1;
  if (typeRoll < CONFIG.GOLDEN_CHANCE) { 
    type = 'golden'; 
    multiplier = 3; 
  } else if (typeRoll < CONFIG.GOLDEN_CHANCE + CONFIG.EXPLOSIVE_CHANCE) { 
    type = 'explosive'; 
  }
  
  return { 
    id, x, y, 
    dx: Math.cos(angle) * CONFIG.SPEED, 
    dy: Math.sin(angle) * CONFIG.SPEED, 
    value: 9, 
    ticksSinceCountdown: 0, 
    alive: true, 
    type, 
    multiplier 
  };
}

function randomizeBounce(ball, rng, eventType) {
  const variation = (rng.nextDouble(eventType) - 0.5) * 0.1 * Math.PI;
  const angle = Math.atan2(ball.dy, ball.dx) + variation;
  const speed = Math.sqrt(ball.dx**2 + ball.dy**2);
  ball.dx = fpRound(Math.cos(angle) * speed);
  ball.dy = fpRound(Math.sin(angle) * speed);
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
    randomizeBounce(ball, rng, `bumper_${ball.id}`);
    return true;
  }
  return false;
}

// ===== GAME STATE =====

function createInitialState(gameSeedHex, numBalls) {
  return { 
    rng: new InputSeededRNG(gameSeedHex),
    gameSeedHex,
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
    nextBallId: 1,
    inputLog: []  // For replay verification
  };
}

// ===== TICK =====

function tick(state, bumperTarget) {
  if (state.finished) return [];
  const events = [];
  
  state.tickCount++;
  if (state.spawnCooldown > 0) state.spawnCooldown--;

  // Apply bumper input FIRST
  if (bumperTarget) {
    state.bumper.targetX = clamp(bumperTarget.x, BUMPER.MIN_X, BUMPER.MAX_X);
    state.bumper.targetY = clamp(bumperTarget.y, BUMPER.MIN_Y, BUMPER.MAX_Y);
  }
  moveBumper(state.bumper);

  // Set RNG context (uses final bumper position)
  state.rng.setTickContext(state.tickCount, state.bumper.x, state.bumper.y);
  
  // Log input for replay
  state.inputLog.push({ tick: state.tickCount, target: { x: state.bumper.targetX, y: state.bumper.targetY } });

  // Spawn
  if (state.tickCount % CONFIG.SPAWN_INTERVAL === 0 && 
      state.balls.length < CONFIG.MAX_ON_FIELD && 
      state.spawnCooldown <= 0 && 
      state.ballsSpawned < state.numBalls) {
    const ball = createBall(state.rng, state.nextBallId++);
    state.balls.push(ball); 
    state.ballsSpawned++; 
    state.spawnCooldown = CONFIG.SPAWN_COOLDOWN;
    events.push({ type: 'spawn', ball });
  }

  // Update balls
  for (const b of state.balls) {
    if (!b.alive) continue;
    b.ticksSinceCountdown++;
    b.x = fpRound(b.x + b.dx); 
    b.y = fpRound(b.y + b.dy);
    
    const R = CONFIG.BALL_R, F = CONFIG.FIELD;
    let hitWall = false;
    if (b.x - R < 0) { b.x = R; b.dx = -b.dx; hitWall = true; }
    if (b.x + R > F) { b.x = F - R; b.dx = -b.dx; hitWall = true; }
    if (b.y - R < 0) { b.y = R; b.dy = -b.dy; hitWall = true; }
    if (b.y + R > F) { b.y = F - R; b.dy = -b.dy; hitWall = true; }
    
    if (b.type === 'normal' && b.ticksSinceCountdown >= CONFIG.COUNTDOWN && b.value > 0) {
      b.value--; 
      b.ticksSinceCountdown = 0;
      if (b.value <= 0) { b.alive = false; b.diedFromTimeout = true; events.push({ type: 'timeout', ball: b }); }
    }
    
    if (b.alive && hitWall) {
      randomizeBounce(b, state.rng, `wall_${b.id}`);
    }
  }

  // Bumper collision
  for (const b of state.balls) {
    if (b.alive && collideBallBumper(b, state.bumper, state.rng)) {
      events.push({ type: 'bumperHit', ball: b });
    }
  }

  // Center recharge
  for (const b of state.balls) {
    if (b.alive && isInCenter(b)) {
      const dx = b.x - CONFIG.CENTER_X, dy = b.y - CONFIG.CENTER_Y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > 0) { 
        b.dx = (dx/d)*CONFIG.SPEED; 
        b.dy = (dy/d)*CONFIG.SPEED; 
        randomizeBounce(b, state.rng, `center_${b.id}`); 
      }
      if (b.type === 'normal' && b.value < 9) { 
        b.value = 9; 
        b.ticksSinceCountdown = 0; 
        events.push({ type: 'recharge', ball: b });
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
      events.push({ type: 'goal', ball, prize, side: isInLeftGoal(ball) ? 'left' : 'right' });
      ball.alive = false;
      
      if (ball.type === 'explosive') {
        state.timeoutCount = 0;
        events.push({ type: 'explosion', ball, x: ball.x, y: ball.y });
        for (const o of state.balls) {
          if (o.alive && o.id !== ball.id && isInUpperHalf(o)) {
            const ep = o.value * o.multiplier * state.progressive;
            state.totalWin += ep;
            if (state.progressive < CONFIG.PROGRESSIVE_CAP) state.progressive++;
            events.push({ type: 'exploded', ball: o, prize: ep });
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
          if (ov > 0) { 
            b1.x -= nx*ov*0.5; b1.y -= ny*ov*0.5; 
            b2.x += nx*ov*0.5; b2.y += ny*ov*0.5; 
          }
          b1.dx = -nx*CONFIG.SPEED; b1.dy = -ny*CONFIG.SPEED;
          b2.dx = nx*CONFIG.SPEED; b2.dy = ny*CONFIG.SPEED;
          randomizeBounce(b1, state.rng, `coll_${b1.id}_${b2.id}_1`); 
          randomizeBounce(b2, state.rng, `coll_${b1.id}_${b2.id}_2`);
          continue;
        }
        
        if (s1) { b2.alive = false; state.totalWin += 1; events.push({ type: 'collision', winner: b1, loser: b2, prize: 1 }); continue; }
        if (s2) { b1.alive = false; state.totalWin += 1; events.push({ type: 'collision', winner: b2, loser: b1, prize: 1 }); continue; }
        
        if (b1.value === b2.value) {
          const prize = b1.value * 2;
          state.totalWin += prize;
          events.push({ type: 'double', b1, b2, prize });
          const roll = state.rng.nextDouble(`double_${b1.id}_${b2.id}`);
          if (roll < 0.5) b2.alive = false; else b1.alive = false;
        } else {
          state.totalWin += 1;
          const loser = b1.value < b2.value ? b1 : b2;
          const winner = b1.value < b2.value ? b2 : b1;
          loser.alive = false;
          const dx = winner.x - loser.x, dy = winner.y - loser.y;
          const d = Math.sqrt(dx*dx + dy*dy) || 1;
          winner.dx = (dx/d)*CONFIG.SPEED; 
          winner.dy = (dy/d)*CONFIG.SPEED;
          randomizeBounce(winner, state.rng, `win_${winner.id}`);
          events.push({ type: 'collision', winner, loser, prize: 1 });
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
        events.push({ type: 'progressiveReset' });
      }
      b.diedFromTimeout = false;
    }
  }

  state.balls = state.balls.filter(b => b.alive);

  // Auto-collect special balls
  if (state.balls.length > 0 && !state.balls.some(b => b.type === 'normal')) {
    for (const b of state.balls) {
      if (b.alive) {
        const prize = b.value * b.multiplier * state.progressive;
        state.totalWin += prize;
        if (state.progressive < CONFIG.PROGRESSIVE_CAP) state.progressive++;
        events.push({ type: 'autoCollect', ball: b, prize });
        b.alive = false;
      }
    }
    state.balls = [];
  }

  // End condition
  if (state.ballsSpawned >= state.numBalls && state.balls.length === 0) {
    state.finished = true;
    events.push({ type: 'gameEnd', totalWin: state.totalWin });
  }
  
  return events;
}

// Replay from input log
function replay(gameSeedHex, numBalls, inputLog) {
  const state = createInitialState(gameSeedHex, numBalls);
  
  let inputIdx = 0;
  let safety = 0;
  const maxTicks = numBalls * CONFIG.MAX_TICKS_PER_BALL;
  
  while (!state.finished && safety < maxTicks) {
    let target = null;
    if (inputIdx < inputLog.length && inputLog[inputIdx].tick === state.tickCount + 1) {
      target = inputLog[inputIdx].target;
      inputIdx++;
    } else if (state.tickCount > 0) {
      target = { x: state.bumper.targetX, y: state.bumper.targetY };
    }
    
    tick(state, target);
    safety++;
  }
  
  return state;
}

// Finish game
function finishGame(state) {
  const target = { x: state.bumper.targetX, y: state.bumper.targetY };
  let safety = 0;
  while (!state.finished && safety < 100000) {
    tick(state, target);
    safety++;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG, BUMPER, InputSeededRNG,
    createInitialState, tick, replay, finishGame,
    clamp, fpRound, sha256Pure, hmacSha256Pure, bytesToDouble, bytesToHex
  };
}
