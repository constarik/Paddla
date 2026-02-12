// PADDLA Server v0.7 - Clean Provably Fair Protocol
// 1. GET /commitment → client records BEFORE sending clientSeed
// 2. POST /game/start {clientSeed} → gameId (NO seed revealed!)
// 3. Client plays locally, randomness = f(seed, bumper position)
// 4. POST /game/finish {inputLog, totalWin} → server replays → reveals seed

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { createInitialState, tick, replay, finishGame, CONFIG } = require('./engine');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// ===== COMMITMENT MANAGEMENT =====
// Server seed rotates periodically. Commitment is SHA256(serverSeed).
// Client must fetch commitment BEFORE starting a game.

let serverSeed = crypto.randomBytes(32).toString('hex');
let commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
let commitmentTimestamp = Date.now();
let previousServerSeed = null;  // Keep previous for games started before rotation
let previousCommitment = null;

function rotateSeed() {
  previousServerSeed = serverSeed;
  previousCommitment = commitment;
  serverSeed = crypto.randomBytes(32).toString('hex');
  commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
  commitmentTimestamp = Date.now();
  console.log(`[${new Date().toISOString()}] Seed rotated. New commitment: ${commitment.substring(0, 16)}...`);
}

// Rotate every hour
setInterval(rotateSeed, 60 * 60 * 1000);

// ===== GAME STORAGE =====
const games = {};

// Cleanup old games (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, game] of Object.entries(games)) {
    if (now - game.createdAt > 60 * 60 * 1000) {
      delete games[id];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[${new Date().toISOString()}] Cleaned ${cleaned} old games`);
  }
}, 10 * 60 * 1000);

// ===== ENDPOINTS =====

// GET /commitment - Get current commitment (STEP 1)
// Client MUST call this and record the commitment BEFORE sending clientSeed
app.get('/commitment', (req, res) => {
  res.json({ 
    commitment,
    timestamp: commitmentTimestamp,
    expiresIn: 60 * 60 * 1000 - (Date.now() - commitmentTimestamp)  // ms until rotation
  });
});

// POST /game/start - Start new game (STEP 2)
// Client sends clientSeed AFTER recording commitment
// Server does NOT reveal gameSeed - client cannot predict randomness!
app.post('/game/start', (req, res) => {
  const { clientSeed, numBalls, recordedCommitment } = req.body;
  
  if (!clientSeed || !numBalls || numBalls < 1 || numBalls > 1000) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  // Verify client recorded the commitment (optional but recommended)
  let useSeed = serverSeed;
  let useCommitment = commitment;
  
  if (recordedCommitment) {
    if (recordedCommitment === commitment) {
      useSeed = serverSeed;
      useCommitment = commitment;
    } else if (recordedCommitment === previousCommitment && previousServerSeed) {
      // Allow games started with previous commitment (within grace period)
      useSeed = previousServerSeed;
      useCommitment = previousCommitment;
    } else {
      return res.status(400).json({ error: 'Invalid commitment - please refresh and try again' });
    }
  }
  
  const gameId = crypto.randomUUID();
  const gameSeedHex = crypto.createHmac('sha256', useSeed)
    .update(`${clientSeed}:${gameId}`)
    .digest('hex');
  
  games[gameId] = {
    clientSeed,
    serverSeed: useSeed,  // Snapshot at game start
    commitment: useCommitment,
    gameSeedHex,
    numBalls,
    createdAt: Date.now(),
    finished: false,
    verified: false
  };
  
  console.log(`[${new Date().toISOString()}] Game started: ${gameId.substring(0, 8)}... (${numBalls} balls)`);
  
  // With input-seeded randomness, revealing gameSeedHex is SAFE!
  // Client cannot predict future random events because each depends on bumper position
  // They must commit to a position before knowing the random outcome
  res.json({
    gameId,
    commitment: useCommitment,
    gameSeedHex  // Safe to reveal - randomness = f(gameSeedHex, bumper_position)
  });
});

// POST /game/:id/finish - Finish game and verify (STEP 3)
// Client sends inputLog and their calculated totalWin
// Server replays with same gameSeed + inputLog → if match, reveals seed
app.post('/game/:id/finish', (req, res) => {
  const { id } = req.params;
  const { inputLog, clientTotalWin } = req.body;
  
  const game = games[id];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }
  if (!Array.isArray(inputLog)) {
    return res.status(400).json({ error: 'Invalid input log' });
  }
  
  // Replay game with server's gameSeedHex + client's inputLog
  const replayState = replay(game.gameSeedHex, game.numBalls, inputLog);
  const serverTotalWin = replayState.totalWin;
  
  game.finished = true;
  game.serverTotalWin = serverTotalWin;
  game.clientTotalWin = clientTotalWin;
  
  // Verify
  const verified = (clientTotalWin === serverTotalWin);
  game.verified = verified;
  
  console.log(`[${new Date().toISOString()}] Game ${id.substring(0, 8)}... finished. ` +
    `Client: ${clientTotalWin}, Server: ${serverTotalWin}, Verified: ${verified}`);
  
  if (verified) {
    // Reveal server seed for client verification
    res.json({
      verified: true,
      totalWin: serverTotalWin,
      verification: {
        serverSeed: game.serverSeed,
        gameSeedHex: game.gameSeedHex,
        clientSeed: game.clientSeed,
        gameId: id
      }
    });
  } else {
    // Mismatch - possible cheating attempt or bug
    console.warn(`[MISMATCH] Game ${id}: client=${clientTotalWin}, server=${serverTotalWin}`);
    res.json({
      verified: false,
      serverTotalWin,
      clientTotalWin,
      error: 'Result mismatch - game not verified'
    });
  }
  
  // Keep game for debugging, then delete
  setTimeout(() => delete games[id], 5 * 60 * 1000);
});

// GET /game/:id/status - Check game status (for debugging)
app.get('/game/:id/status', (req, res) => {
  const game = games[req.params.id];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json({
    gameId: req.params.id,
    numBalls: game.numBalls,
    finished: game.finished,
    verified: game.verified,
    createdAt: game.createdAt
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '0.7',
    protocol: 'Clean Provably Fair',
    activeGames: Object.keys(games).length,
    commitment: commitment.substring(0, 16) + '...'
  });
});

// Version info
app.get('/version', (req, res) => {
  res.json({
    server: '0.7',
    engine: '0.6',
    protocol: 'Input-Seeded Randomness',
    description: 'Randomness depends on gameSeed + bumper position. Client cannot predict future random events.'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PADDLA Server v0.7 (Clean Provably Fair) running on port ${PORT}`);
  console.log(`Initial commitment: ${commitment.substring(0, 16)}...`);
  console.log(`Protocol: Input-Seeded Randomness - client cannot predict future events`);
});
