/**
 * PADDLA Engine - Main export
 */

const { JavaRandom, fpRound, dist, clamp, FP_ROUND } = require('./core.js');
const { CONFIG, BUMPER } = require('./config.js');
const { GameEngine, createBall, createBumper } = require('./game.js');

module.exports = {
  // Core
  JavaRandom,
  fpRound,
  dist,
  clamp,
  FP_ROUND,
  
  // Config
  CONFIG,
  BUMPER,
  
  // Engine
  GameEngine,
  createBall,
  createBumper
};
