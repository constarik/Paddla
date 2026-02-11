/**
 * PADDLA Engine - Configuration
 */

const CONFIG = {
  // Field
  FIELD: 9,
  
  // Ball
  BALL_R: 0.2,
  SPEED: 0.05,
  
  // Goals (top corners)
  GOAL_R: 1.02,
  
  // Center recharge zone
  CENTER_R: 0.225,
  CENTER_X: 4.5,
  CENTER_Y: 4.5,
  
  // Ball mechanics
  COUNTDOWN: 45,           // ticks between value decay
  GOLDEN_CHANCE: 0.01,     // 1%
  EXPLOSIVE_CHANCE: 1/75,  // ~1.33%
  
  // Spawning
  SPAWN_COOLDOWN: 60,
  SPAWN_INTERVAL: 60,
  MAX_ON_FIELD: 10,
  
  // Progressive
  TIMEOUT_LIMIT: 5,
  PROGRESSIVE_CAP: 5,
  
  // Economy
  BET_PER_BALL: 5,
  
  // Simulation limits
  MAX_TICKS_PER_BALL: 600
};

const BUMPER = {
  RADIUS: 0.4,             // 2× ball radius
  MIN_Y: 0.4,              // inside top wall
  MAX_Y: 3.5,              // above center (не касается перезарядки)
  MIN_X: 1.5,              // avoid blocking goals directly
  MAX_X: 9 - 1.5,          // 7.5
  MAX_SPEED: 0.15,         // 3× ball speed
  START_X: 4.5,            // initial position (center)
  START_Y: 2.0             // upper area
};

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, BUMPER };
}
