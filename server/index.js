/**
 * PADDLA Server
 * Provably Fair game server with VRF
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { VRF } = require('./vrf.js');

// Import engine (reuse from engine folder)
const path = require('path');
const { JavaRandom, fpRound, dist, clamp } = require(path.join(__dirname, '../engine/core.js'));
const { CONFIG, BUMPER } = require(path.join(__dirname, '../engine/config.js'));
const { GameEngine } = require(path.join(__dirname, '../engine/game.js'));

const app = express();
app.use(cors());
app.use(express.json());

// ==================== STATE ====================

// Active games storage
const activeGames = new Map();

// Server VRF instance (rotates periodically)
let serverVRF = new VRF();

// Rotate server seed periodically (e.g., every hour)
const SEED_ROTATION_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  console.log('Rotating server seed...');
  serverVRF = new VRF();
}, SEED_ROTATION_INTERVAL);

// ==================== HELPERS ====================

function generateGameId() {
  return crypto.randomBytes(16).toString('hex');
}

// ==================== API ENDPOINTS ====================

/**
 * GET /commitment
 * Get current server seed commitment (for transparency)
 */
app.get('/commitment', (req, res) => {
  res.json({
    commitment: serverVRF.commitment,
    timestamp: Date.now()
  });
});

/**
 * POST /game/start
 * Start a new provably fair game
 * Body: { clientSeed: string, numBalls: number }
 */
app.post('/game/start', (req, res) => {
  const { clientSeed, numBalls } = req.body;

  if (!clientSeed || typeof clientSeed !== 'string') {
    return res.status(400).json({ error: 'clientSeed required' });
  }

  if (!numBalls || numBalls < 1 || numBalls > 1000) {
    return res.status(400).json({ error: 'numBalls must be 1-1000' });
  }

  const gameId = generateGameId();
  const gameData = serverVRF.generateGameSeed(clientSeed, gameId);

  // Create game state
  const state = GameEngine.createInitialState(gameData.seed, numBalls);

  // Store game
  activeGames.set(gameId, {
    gameId,
    clientSeed,
    numBalls,
    gameSeed: gameData.seed,
    gameSeedHex: gameData.seedHex,
    commitment: gameData.commitment,
    state,
    inputLog: [],
    startTime: Date.now(),
    finished: false
  });

  // Clean up old games (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, game] of activeGames) {
    if (game.startTime < oneHourAgo) {
      activeGames.delete(id);
    }
  }

  res.json({
    gameId,
    commitment: gameData.commitment,
    numBalls,
    betAmount: numBalls * CONFIG.BET_PER_BALL
  });
});

/**
 * POST /game/input
 * Send player input during game
 * Body: { gameId: string, tick: number, target: { x: number, y: number } }
 */
app.post('/game/input', (req, res) => {
  const { gameId, tick, target } = req.body;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }

  // Record input
  game.inputLog.push({
    tick,
    target: {
      x: clamp(target.x, BUMPER.MIN_X, BUMPER.MAX_X),
      y: clamp(target.y, BUMPER.MIN_Y, BUMPER.MAX_Y)
    }
  });

  res.json({ ok: true });
});

/**
 * POST /game/tick
 * Process game ticks
 * Body: { gameId: string, targetX: number, targetY: number }
 */
app.post('/game/tick', (req, res) => {
  const { gameId, targetX, targetY } = req.body;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }

  // Update bumper target
  game.state.bumper.targetX = clamp(targetX, BUMPER.MIN_X, BUMPER.MAX_X);
  game.state.bumper.targetY = clamp(targetY, BUMPER.MIN_Y, BUMPER.MAX_Y);

  // Record input
  game.inputLog.push({
    tick: game.state.tickCount,
    target: { x: game.state.bumper.targetX, y: game.state.bumper.targetY }
  });

  // Process tick
  const result = GameEngine.tick(game.state);
  game.state = result.state;

  // Check if finished
  if (game.state.finished) {
    game.finished = true;
  }

  res.json({
    tickCount: game.state.tickCount,
    balls: game.state.balls,
    bumper: game.state.bumper,
    progressive: game.state.progressive,
    totalWin: game.state.totalWin,
    ballsSpawned: game.state.ballsSpawned,
    finished: game.finished,
    events: result.events
  });
});

/**
 * POST /game/simulate
 * Run full simulation server-side (for AI modes)
 * Body: { gameId: string, inputLog: Array }
 */
app.post('/game/simulate', (req, res) => {
  const { gameId, inputLog } = req.body;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }

  // Run simulation with input log
  const result = GameEngine.simulateWithInput(game.gameSeed, game.numBalls, inputLog || []);

  game.finished = true;
  game.inputLog = inputLog || [];
  game.state.totalWin = result.totalWin;
  game.state.stats = result.stats;

  res.json({
    totalWin: result.totalWin,
    stats: result.stats,
    ticks: result.ticks
  });
});

/**
 * POST /game/:gameId/finish
 * Mark game as finished and get verification data
 * Body: { totalWin: number, inputLog: Array }
 */
app.post('/game/:gameId/finish', (req, res) => {
  const { gameId } = req.params;
  const { totalWin, inputLog } = req.body;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Mark as finished
  game.finished = true;
  game.state.totalWin = totalWin || 0;
  game.inputLog = inputLog || [];

  // Get server seed for verification
  const proof = serverVRF.getProof();

  res.json({
    gameId,
    clientSeed: game.clientSeed,
    numBalls: game.numBalls,
    totalWin: game.state.totalWin,
    betAmount: game.numBalls * CONFIG.BET_PER_BALL,
    
    // Verification data
    verification: {
      commitment: game.commitment,
      serverSeed: proof.serverSeed,
      gameSeedHex: game.gameSeedHex,
      gameSeed: game.gameSeed
    }
  });
});

/**
 * GET /game/:gameId/result
 * Get game result with verification data
 */
app.get('/game/:gameId/result', (req, res) => {
  const { gameId } = req.params;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (!game.finished) {
    return res.status(400).json({ error: 'Game not finished yet' });
  }

  // Get server seed for verification (only revealed after game ends)
  const proof = serverVRF.getProof();

  res.json({
    gameId,
    clientSeed: game.clientSeed,
    numBalls: game.numBalls,
    totalWin: game.state.totalWin,
    betAmount: game.numBalls * CONFIG.BET_PER_BALL,
    rtp: (game.state.totalWin / (game.numBalls * CONFIG.BET_PER_BALL) * 100).toFixed(2),
    
    // Verification data
    verification: {
      commitment: game.commitment,
      serverSeed: proof.serverSeed,
      gameSeedHex: game.gameSeedHex,
      gameSeed: game.gameSeed,
      inputLog: game.inputLog
    },

    // How to verify
    verifyInstructions: [
      '1. Check: SHA256(serverSeed) === commitment',
      '2. Check: HMAC-SHA256(serverSeed, clientSeed + ":" + gameId) === gameSeedHex',
      '3. Replay: GameEngine.simulateWithInput(gameSeed, numBalls, inputLog) === totalWin'
    ]
  });
});

/**
 * GET /game/:gameId/status
 * Get current game status
 */
app.get('/game/:gameId/status', (req, res) => {
  const { gameId } = req.params;

  const game = activeGames.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json({
    gameId,
    numBalls: game.numBalls,
    ballsSpawned: game.state.ballsSpawned,
    ballsOnField: game.state.balls.length,
    totalWin: game.state.totalWin,
    progressive: game.state.progressive,
    finished: game.finished
  });
});

/**
 * GET /verify
 * Client verification endpoint (CORS enabled for browser)
 */
app.get('/verify', (req, res) => {
  const { serverSeed, clientSeed, gameId, commitment, gameSeedHex } = req.query;

  if (!serverSeed || !clientSeed || !gameId || !commitment || !gameSeedHex) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const result = VRF.verify(serverSeed, clientSeed, gameId, commitment, gameSeedHex);
  res.json(result);
});

/**
 * GET /config
 * Get game configuration (for client sync)
 */
app.get('/config', (req, res) => {
  res.json({
    CONFIG,
    BUMPER,
    BET_PER_BALL: CONFIG.BET_PER_BALL
  });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('PADDLA Provably Fair Server');
  console.log('='.repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`Commitment: ${serverVRF.commitment}`);
  console.log('='.repeat(50));
  console.log('Endpoints:');
  console.log('  GET  /commitment      - Current server commitment');
  console.log('  POST /game/start      - Start new game');
  console.log('  POST /game/tick       - Process game tick');
  console.log('  POST /game/simulate   - Run full simulation');
  console.log('  GET  /game/:id/result - Get result with proof');
  console.log('  GET  /game/:id/status - Get game status');
  console.log('  GET  /verify          - Verify game');
  console.log('  GET  /config          - Get game config');
  console.log('='.repeat(50));
});

module.exports = app;
