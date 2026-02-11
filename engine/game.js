/**
 * PADDLA Engine - Game Logic
 * Ball Rush + interactive bumper
 */

// Node.js imports
if (typeof require !== 'undefined') {
  var { JavaRandom, fpRound, dist, clamp } = require('./core.js');
  var { CONFIG, BUMPER } = require('./config.js');
}

// ==================== HELPERS ====================

function isInLeftGoal(b) {
  return dist(b.x, b.y, 0, 0) < CONFIG.GOAL_R;
}

function isInRightGoal(b) {
  return dist(b.x, b.y, CONFIG.FIELD, 0) < CONFIG.GOAL_R;
}

function isGoal(b) {
  return isInLeftGoal(b) || isInRightGoal(b);
}

function isInCenter(b) {
  return dist(b.x, b.y, CONFIG.CENTER_X, CONFIG.CENTER_Y) < CONFIG.CENTER_R + CONFIG.BALL_R;
}

function isInUpperHalf(b) {
  return b.y < CONFIG.FIELD / 2;
}

// ==================== BALL ====================

function createBall(rng, id) {
  const x = 0.5 + rng.nextDouble() * 8;
  const y = CONFIG.FIELD - 0.3;
  const angle = (220 + rng.nextDouble() * 100) * Math.PI / 180;
  
  const typeRoll = rng.nextDouble();
  let type = 'normal', multiplier = 1;
  if (typeRoll < CONFIG.GOLDEN_CHANCE) {
    type = 'golden';
    multiplier = 3;
  } else if (typeRoll < CONFIG.GOLDEN_CHANCE + CONFIG.EXPLOSIVE_CHANCE) {
    type = 'explosive';
    multiplier = 1;
  }
  
  return {
    id,
    x,
    y,
    dx: Math.cos(angle) * CONFIG.SPEED,
    dy: Math.sin(angle) * CONFIG.SPEED,
    value: 9,
    ticksSinceCountdown: 0,
    alive: true,
    type,
    multiplier
  };
}

function randomizeBounce(ball, rng) {
  const angle = Math.atan2(ball.dy, ball.dx) + (rng.nextDouble() - 0.5) * 0.1 * Math.PI;
  const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
  ball.dx = fpRound(Math.cos(angle) * speed);
  ball.dy = fpRound(Math.sin(angle) * speed);
}

// ==================== BUMPER ====================

function createBumper() {
  return {
    x: BUMPER.START_X,
    y: BUMPER.START_Y,
    targetX: BUMPER.START_X,
    targetY: BUMPER.START_Y
  };
}

function updateBumperTarget(bumper, targetX, targetY) {
  bumper.targetX = clamp(targetX, BUMPER.MIN_X, BUMPER.MAX_X);
  bumper.targetY = clamp(targetY, BUMPER.MIN_Y, BUMPER.MAX_Y);
}

function moveBumper(bumper) {
  const dx = bumper.targetX - bumper.x;
  const dy = bumper.targetY - bumper.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  
  if (d > BUMPER.MAX_SPEED) {
    bumper.x = fpRound(bumper.x + (dx / d) * BUMPER.MAX_SPEED);
    bumper.y = fpRound(bumper.y + (dy / d) * BUMPER.MAX_SPEED);
  } else {
    bumper.x = bumper.targetX;
    bumper.y = bumper.targetY;
  }
}

function collideBallBumper(ball, bumper, rng) {
  const dx = ball.x - bumper.x;
  const dy = ball.y - bumper.y;
  const d = dist(ball.x, ball.y, bumper.x, bumper.y);
  const minDist = CONFIG.BALL_R + BUMPER.RADIUS;
  
  if (d < minDist && d > 0) {
    // Normal from bumper to ball
    const nx = dx / d;
    const ny = dy / d;
    
    // Reflect velocity
    const dot = ball.dx * nx + ball.dy * ny;
    ball.dx = fpRound(ball.dx - 2 * dot * nx);
    ball.dy = fpRound(ball.dy - 2 * dot * ny);
    
    // Push ball out of collision
    ball.x = fpRound(bumper.x + nx * minDist);
    ball.y = fpRound(bumper.y + ny * minDist);
    
    // Randomize bounce
    randomizeBounce(ball, rng);
    
    return true;
  }
  return false;
}

// ==================== GAME ENGINE ====================

class GameEngine {
  static CONFIG = CONFIG;
  static BUMPER = BUMPER;
  static BET_PER_BALL = CONFIG.BET_PER_BALL;

  static createInitialState(seed, numBalls) {
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
      stats: {
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
      },
      inputLog: [],
      finished: false,
      nextBallId: 1
    };
  }

  static setInput(state, targetX, targetY) {
    // Record input
    state.inputLog.push({
      tick: state.tickCount,
      target: { x: targetX, y: targetY }
    });
    // Update bumper target
    updateBumperTarget(state.bumper, targetX, targetY);
  }

  static tick(state) {
    if (state.finished) return { state, events: [] };
    
    const events = [];
    const s = {
      ...state,
      balls: state.balls.map(b => ({ ...b })),
      bumper: { ...state.bumper },
      stats: { ...state.stats }
    };
    s.tickCount++;
    if (s.spawnCooldown > 0) s.spawnCooldown--;

    // ===== MOVE BUMPER =====
    moveBumper(s.bumper);

    // ===== SPAWN =====
    if (s.tickCount % CONFIG.SPAWN_INTERVAL === 0 &&
        s.balls.length < CONFIG.MAX_ON_FIELD &&
        s.spawnCooldown <= 0 &&
        s.ballsSpawned < s.numBalls) {
      const newBall = createBall(s.rng, s.nextBallId++);
      s.balls.push(newBall);
      s.ballsSpawned++;
      s.stats.ballsFired++;
      s.spawnCooldown = CONFIG.SPAWN_COOLDOWN;
      events.push({ type: 'spawn', ball: { ...newBall } });
    }

    // ===== UPDATE BALLS =====
    for (const b of s.balls) {
      if (!b.alive) continue;
      b.ticksSinceCountdown++;
      b.x = fpRound(b.x + b.dx);
      b.y = fpRound(b.y + b.dy);
      
      // Wall collisions
      const R = CONFIG.BALL_R, F = CONFIG.FIELD;
      if (b.x - R < 0) { b.x = R; b.dx = -b.dx; }
      if (b.x + R > F) { b.x = F - R; b.dx = -b.dx; }
      if (b.y - R < 0) { b.y = R; b.dy = -b.dy; }
      if (b.y + R > F) { b.y = F - R; b.dy = -b.dy; }
      
      // Value decay
      if (b.type !== 'golden' && b.type !== 'explosive' &&
          b.ticksSinceCountdown >= CONFIG.COUNTDOWN && b.value > 0) {
        b.value--;
        b.ticksSinceCountdown = 0;
        if (b.value <= 0) {
          b.alive = false;
          b.diedFromTimeout = true;
        }
      }
      
      // Randomize on wall hit
      if (b.alive && (b.x - R < 0.01 || b.x + R > F - 0.01 ||
                      b.y - R < 0.01 || b.y + R > F - 0.01)) {
        randomizeBounce(b, s.rng);
      }
    }

    // ===== BUMPER COLLISION =====
    for (const b of s.balls) {
      if (!b.alive) continue;
      if (collideBallBumper(b, s.bumper, s.rng)) {
        s.stats.bumperHits++;
        events.push({ type: 'bumperHit', ball: { ...b } });
      }
    }

    // ===== CENTER RECHARGE =====
    for (const b of s.balls) {
      if (b.alive && isInCenter(b)) {
        const dx = b.x - CONFIG.CENTER_X;
        const dy = b.y - CONFIG.CENTER_Y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) {
          b.dx = (dx / d) * CONFIG.SPEED;
          b.dy = (dy / d) * CONFIG.SPEED;
          randomizeBounce(b, s.rng);
        }
        if (b.type !== 'golden' && b.type !== 'explosive' && b.value < 9) {
          b.value = 9;
          b.ticksSinceCountdown = 0;
          s.stats.recharges++;
          events.push({ type: 'recharge', ball: { ...b } });
        }
      }
    }

    // ===== GOALS =====
    for (const ball of s.balls) {
      if (!ball.alive) continue;
      if (isGoal(ball)) {
        const prize = ball.value * ball.multiplier * s.progressive;
        s.totalWin += prize;
        s.stats.goals++;
        s.stats.goalsWin += prize;
        
        if (ball.type === 'golden') {
          s.stats.golden++;
          s.stats.goldenWin += prize;
          s.timeoutCount = 0;
        }
        if (ball.value === 9 && ball.multiplier >= 3) {
          s.stats.jackpots++;
          s.stats.jackpotsWin += prize;
        }
        if (s.progressive < CONFIG.PROGRESSIVE_CAP) s.progressive++;
        if (s.progressive > s.stats.progressiveMax) s.stats.progressiveMax = s.progressive;
        
        const side = isInLeftGoal(ball) ? 'left' : 'right';
        events.push({ type: 'goal', ball: { ...ball }, prize, progressive: s.progressive, side });
        ball.alive = false;
        
        // Explosive chain
        if (ball.type === 'explosive') {
          s.stats.explosions++;
          s.timeoutCount = 0;
          const exploded = [];
          for (const other of s.balls) {
            if (other.alive && other.id !== ball.id && isInUpperHalf(other)) {
              const ePrize = other.value * other.multiplier * s.progressive;
              s.totalWin += ePrize;
              s.stats.goals++;
              s.stats.goalsWin += ePrize;
              s.stats.explosionsWin += ePrize;
              if (other.type === 'golden') {
                s.stats.golden++;
                s.stats.goldenWin += ePrize;
              }
              if (s.progressive < CONFIG.PROGRESSIVE_CAP) s.progressive++;
              if (s.progressive > s.stats.progressiveMax) s.stats.progressiveMax = s.progressive;
              other.alive = false;
              s.stats.explodedBalls++;
              exploded.push({ ball: { ...other }, prize: ePrize });
            }
          }
          events.push({ type: 'explosion', ball: { ...ball }, exploded });
        }
      }
    }

    // ===== BALL-BALL COLLISIONS =====
    for (let i = 0; i < s.balls.length; i++) {
      for (let j = i + 1; j < s.balls.length; j++) {
        const b1 = s.balls[i], b2 = s.balls[j];
        if (!b1.alive || !b2.alive) continue;
        if (dist(b1.x, b1.y, b2.x, b2.y) < CONFIG.BALL_R * 2) {
          const s1 = b1.type !== 'normal', s2 = b2.type !== 'normal';
          
          // Both special: elastic collision
          if (s1 && s2) {
            const dx = b2.x - b1.x, dy = b2.y - b1.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 0) {
              const nx = dx / d, ny = dy / d;
              const ov = CONFIG.BALL_R * 2 - d;
              if (ov > 0) {
                b1.x -= nx * ov * 0.5;
                b1.y -= ny * ov * 0.5;
                b2.x += nx * ov * 0.5;
                b2.y += ny * ov * 0.5;
              }
              b1.dx = -nx * CONFIG.SPEED;
              b1.dy = -ny * CONFIG.SPEED;
              b2.dx = nx * CONFIG.SPEED;
              b2.dy = ny * CONFIG.SPEED;
              randomizeBounce(b1, s.rng);
              randomizeBounce(b2, s.rng);
            }
            continue;
          }
          
          // One special kills normal
          if (s1) {
            b2.alive = false;
            s.totalWin += 1;
            s.stats.collisions++;
            s.stats.collisionsWin += 1;
            events.push({ type: 'collision', winner: { ...b1 }, loser: { ...b2 }, prize: 1 });
            continue;
          }
          if (s2) {
            b1.alive = false;
            s.totalWin += 1;
            s.stats.collisions++;
            s.stats.collisionsWin += 1;
            events.push({ type: 'collision', winner: { ...b2 }, loser: { ...b1 }, prize: 1 });
            continue;
          }
          
          // Both normal: compare values
          if (b1.value === b2.value) {
            const prize = b1.value * 2;
            s.totalWin += prize;
            s.stats.collisions++;
            s.stats.collisionsWin += prize;
            if (s.rng.nextDouble() < 0.5) {
              b2.alive = false;
              events.push({ type: 'collision', winner: { ...b1 }, loser: { ...b2 }, prize });
            } else {
              b1.alive = false;
              events.push({ type: 'collision', winner: { ...b2 }, loser: { ...b1 }, prize });
            }
          } else {
            s.totalWin += 1;
            s.stats.collisions++;
            s.stats.collisionsWin += 1;
            const loser = b1.value < b2.value ? b1 : b2;
            const winner = b1.value < b2.value ? b2 : b1;
            loser.alive = false;
            const dx = winner.x - loser.x, dy = winner.y - loser.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 0) {
              winner.dx = (dx / d) * CONFIG.SPEED;
              winner.dy = (dy / d) * CONFIG.SPEED;
              randomizeBounce(winner, s.rng);
            }
            events.push({ type: 'collision', winner: { ...winner }, loser: { ...loser }, prize: 1 });
          }
        }
      }
    }

    // ===== TIMEOUTS =====
    for (const b of s.balls) {
      if (!b.alive && b.diedFromTimeout) {
        s.timeoutCount++;
        s.stats.timeouts++;
        events.push({ type: 'timeout', ball: { ...b } });
        if (s.timeoutCount >= CONFIG.TIMEOUT_LIMIT) {
          s.progressive = 1;
          s.timeoutCount = 0;
          events.push({ type: 'progressiveReset' });
        }
        b.diedFromTimeout = false;
      }
    }

    // ===== CLEANUP =====
    s.balls = s.balls.filter(b => b.alive);

    // ===== CHECK FINISH =====
    if (s.ballsSpawned >= s.numBalls && s.balls.length === 0) {
      s.finished = true;
      events.push({ type: 'gameEnd', totalWin: s.totalWin });
    }

    return { state: s, events };
  }

  // Simulate without input (bumper stays in place)
  static simulate(seed, numBalls) {
    let state = GameEngine.createInitialState(seed, numBalls);
    let ticks = 0;
    const maxTicks = numBalls * CONFIG.MAX_TICKS_PER_BALL;
    
    while (!state.finished && ticks < maxTicks) {
      const result = GameEngine.tick(state);
      state = result.state;
      ticks++;
    }
    
    return {
      seed,
      numBalls,
      ticks,
      totalWin: state.totalWin,
      stats: state.stats,
      inputLog: state.inputLog
    };
  }

  // Simulate with input log (for replay/verification)
  static simulateWithInput(seed, numBalls, inputLog) {
    let state = GameEngine.createInitialState(seed, numBalls);
    let inputIndex = 0;
    let ticks = 0;
    const maxTicks = numBalls * CONFIG.MAX_TICKS_PER_BALL;
    
    while (!state.finished && ticks < maxTicks) {
      // Apply inputs for this tick
      while (inputIndex < inputLog.length && inputLog[inputIndex].tick <= state.tickCount) {
        const input = inputLog[inputIndex];
        updateBumperTarget(state.bumper, input.target.x, input.target.y);
        inputIndex++;
      }
      
      const result = GameEngine.tick(state);
      state = result.state;
      ticks++;
    }
    
    return {
      seed,
      numBalls,
      ticks,
      totalWin: state.totalWin,
      stats: state.stats
    };
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEngine, createBall, createBumper };
}
