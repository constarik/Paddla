// PADDLA Server v0.5 - Chunked Replay Verification
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createInitialState, replayChunk, finishGame, CONFIG } = require('./engine');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Server seed rotation
let serverSeed = crypto.randomBytes(32).toString('hex');
let commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');

function rotateSeed() {
  serverSeed = crypto.randomBytes(32).toString('hex');
  commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
  console.log(`[${new Date().toISOString()}] Seed rotated. New commitment: ${commitment.substring(0, 16)}...`);
}

// Rotate every hour
setInterval(rotateSeed, 60 * 60 * 1000);

// Game storage
const games = {};

// Cleanup old games (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, game] of Object.entries(games)) {
    if (now - game.createdAt > 60 * 60 * 1000) { // 1 hour
      delete games[id];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[${new Date().toISOString()}] Cleaned ${cleaned} old games`);
  }
}, 10 * 60 * 1000);

// GET /commitment - current commitment
app.get('/commitment', (req, res) => {
  res.json({ commitment });
});

// POST /game/start - start new game
app.post('/game/start', (req, res) => {
  const { clientSeed, numBalls } = req.body;
  
  if (!clientSeed || !numBalls || numBalls < 1 || numBalls > 1000) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  const gameId = crypto.randomUUID();
  const gameSeedHex = crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${gameId}`)
    .digest('hex');
  const gameSeed = parseInt(gameSeedHex.substring(0, 12), 16);
  
  games[gameId] = {
    clientSeed,
    serverSeed,  // Snapshot at game start
    commitment,
    gameSeedHex,
    gameSeed,
    numBalls,
    state: createInitialState(gameSeed, numBalls),
    chunks: {},           // Buffered chunks
    nextChunk: 0,         // Next expected chunk number
    chunksProcessed: 0,   // Chunks successfully replayed
    createdAt: Date.now(),
    finished: false
  };
  
  console.log(`[${new Date().toISOString()}] Game started: ${gameId.substring(0, 8)}... (${numBalls} balls)`);
  
  res.json({
    gameId,
    commitment: games[gameId].commitment,
    gameSeedHex: gameSeedHex.substring(0, 12)  // First 12 hex chars for seed
  });
});

// POST /game/:id/chunk - receive and process chunk
app.post('/game/:id/chunk', async (req, res) => {
  const { id } = req.params;
  const { chunkNum, inputLog, ballsPlayed } = req.body;
  
  const game = games[id];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }
  if (typeof chunkNum !== 'number' || !Array.isArray(inputLog)) {
    return res.status(400).json({ error: 'Invalid chunk data' });
  }
  
  // Store chunk (even if out of order)
  game.chunks[chunkNum] = { inputLog, ballsPlayed };
  
  // Process all ready chunks in order
  while (game.chunks[game.nextChunk]) {
    const chunk = game.chunks[game.nextChunk];
    try {
      await replayChunk(game.state, chunk.inputLog);
      game.chunksProcessed++;
      delete game.chunks[game.nextChunk];
      game.nextChunk++;
    } catch (err) {
      console.error(`Chunk ${game.nextChunk} replay error:`, err);
      return res.status(500).json({ error: 'Replay failed' });
    }
  }
  
  console.log(`[${new Date().toISOString()}] Game ${id.substring(0, 8)}... chunk ${chunkNum} received, processed up to ${game.nextChunk - 1}`);
  
  res.json({ 
    received: true, 
    processedUpTo: game.nextChunk - 1,
    serverWinSoFar: game.state.totalWin  // For debugging, remove in production
  });
});

// POST /game/:id/finish - finish game and verify
app.post('/game/:id/finish', async (req, res) => {
  const { id } = req.params;
  const { clientTotalWin } = req.body;
  
  const game = games[id];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  if (game.finished) {
    return res.status(400).json({ error: 'Game already finished' });
  }
  
  // Wait for any remaining chunks to be processed
  // (In case finish arrives before last chunk)
  let waitCount = 0;
  while (Object.keys(game.chunks).length > 0 && waitCount < 50) {
    await new Promise(r => setTimeout(r, 100));
    waitCount++;
  }
  
  // Run game to completion
  finishGame(game.state);
  
  game.finished = true;
  const serverTotalWin = game.state.totalWin;
  
  // Verify
  const verified = (clientTotalWin === serverTotalWin);
  
  console.log(`[${new Date().toISOString()}] Game ${id.substring(0, 8)}... finished. Verified: ${verified}`);
  
  if (verified) {
    res.json({
      verified: true,
      totalWin: serverTotalWin,
      verification: {
        serverSeed: game.serverSeed,
        gameSeedHex: game.gameSeedHex
      }
    });
  } else {
    res.json({
      verified: false,
      error: 'Verification failed'
    });
  }
  
  // Keep game for a bit for debugging, then delete
  setTimeout(() => delete games[id], 60000);
});

// GET /game/:id/status - check game status (for debugging)
app.get('/game/:id/status', (req, res) => {
  const game = games[req.params.id];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json({
    chunksReceived: Object.keys(game.chunks).length + game.chunksProcessed,
    chunksProcessed: game.chunksProcessed,
    nextExpected: game.nextChunk,
    serverWin: game.state.totalWin,
    ballsSpawned: game.state.ballsSpawned,
    finished: game.finished
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeGames: Object.keys(games).length,
    commitment: commitment.substring(0, 16) + '...'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PADDLA Server v0.5 running on port ${PORT}`);
  console.log(`Initial commitment: ${commitment.substring(0, 16)}...`);
});
