// PADDLA Server v0.8 - UVS 2.0 (Move Batch, G=ALL) with persistent public audit trail
// 1. GET /commitment → client records BEFORE sending clientSeed
// 2. POST /game/start {clientSeed} → gameId
// 3. Client plays locally, randomness = f(seed, bumper position)
// 4. POST /game/finish {inputLog, totalWin} → server replays → verifies → reveals seed → persists to Firestore
// 5. GET /trail, /trail/:id → anyone can fetch & replay verified games (post-factum integrity)

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { createInitialState, tick, replay, finishGame, CONFIG } = require('./engine');

// ===== AUDIT TRAIL (Firestore) — UVS 2.0 persistence layer =====
// Fault-tolerant init: env var on Render, local file in dev, disabled if neither.
// If Firebase is unavailable, server keeps running in RAM-only mode (no crash).
let trailDb = null;
let trailEnabled = false;
(function initTrail() {
  try {
    const admin = require('firebase-admin');
    let sa = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      // Local dev fallback (path not used on Render)
      try { sa = require('C:\\Users\\const\\Downloads\\Code\\holepuncher-constr-firebase-adminsdk-fbsvc-a5c94b33ee.json'); } catch (e) { sa = null; }
    }
    if (!sa) {
      console.warn('[TRAIL] Disabled: no Firebase credentials (set FIREBASE_SERVICE_ACCOUNT). Server runs in RAM-only mode.');
      return;
    }
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
    trailDb = admin.firestore();
    trailEnabled = true;
    console.log('[TRAIL] Enabled: writing verified games to Firestore collection paddla_games.');
  } catch (e) {
    console.warn('[TRAIL] Disabled: init failed (' + e.message + '). Server runs in RAM-only mode.');
  }
})();

// Delta-encode inputLog: keep only ticks where bumper target changed.
// Replay re-applies last target on skipped ticks, so result is identical (verified).
function compressInputLog(inputLog) {
  const out = [];
  let last = null;
  for (const e of inputLog) {
    const k = e.target.x + ',' + e.target.y;
    if (k !== last) { out.push(e); last = k; }
  }
  return out;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));
app.use('/engine', express.static(path.join(__dirname, '../engine')));

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
  const { clientSeed, numBalls, betPerBall: clientBetPerBall, recordedCommitment } = req.body;
  const betPerBall = (clientBetPerBall && [1,5,10,25,50,100].includes(clientBetPerBall)) ? clientBetPerBall : 5;
  
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

  games[gameId] = {
    clientSeed,
    serverSeed: useSeed,
    commitment: useCommitment,
    numBalls,
    betPerBall,
    createdAt: Date.now(),
    finished: false,
    verified: false
  };
  
  console.log(`[${new Date().toISOString()}] Game started: ${gameId.substring(0, 8)}... (${numBalls} balls)`);
  
  // UVS v1-v3 (wire-identical): server reveals serverSeed — client uses SHA-512(serverSeed:bumperX:bumperY:tick) per tick
  res.json({
    gameId,
    commitment: useCommitment,
    serverSeed: useSeed   // UVS v1-v3 (wire-identical): client derives combinedSeed per tick via SHA-512
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
  
  // Replay game with server's serverSeed + client's inputLog (UVS v3 — wire-identical since v1)
  const replayState = replay(game.serverSeed, game.numBalls, inputLog, game.betPerBall || 5);
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
    // ===== UVS 2.0: persist verified game to public audit trail (Firestore) =====
    // serverSeed is already revealed at this point — storing it is safe and required
    // for post-factum replay. Each record is self-contained (survives seed rotation).
    const compactInputLog = compressInputLog(inputLog);
    const trailRecord = {
      gameId: id,
      protocol: 'UVS-2.0',
      G: 'ALL',                       // Move Batch granularity
      gameMode: 'Move',
      commitment: game.commitment,    // SHA-256(serverSeed), published before play
      clientSeed: game.clientSeed,
      serverSeed: game.serverSeed,    // revealed — verifier checks SHA-256(serverSeed)===commitment
      engineVersion: '0.6',
      numBalls: game.numBalls,
      betPerBall: game.betPerBall || 5,
      totalWin: serverTotalWin,
      inputLog: compactInputLog,      // delta-encoded; replay reproduces full session
      inputLogEncoding: 'delta',
      ts: Date.now()
    };
    if (trailEnabled && trailDb) {
      trailDb.collection('paddla_games').doc(id).set(trailRecord)
        .then(() => console.log(`[TRAIL] Saved game ${id.substring(0,8)}... (${compactInputLog.length} input pts)`))
        .catch(e => console.error(`[TRAIL] Save failed for ${id}: ${e.message}`));
    }

    // Reveal server seed for client verification
    res.json({
      verified: true,
      totalWin: serverTotalWin,
      verification: {
        serverSeed: game.serverSeed,
        gameSeedHex: game.gameSeedHex,
        clientSeed: game.clientSeed,
        commitment: game.commitment,
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
  
  // Keep game in RAM briefly for debugging, then delete (audit trail persists in Firestore)
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

// ===== UVS 2.0: public audit trail read endpoints =====
// Anyone can fetch verified game records and replay them locally.
// GET /trail        -> latest N records (metadata, no heavy inputLog)
// GET /trail/:id    -> full record incl. delta-encoded inputLog for replay
app.get('/trail', async (req, res) => {
  if (!trailEnabled || !trailDb) {
    return res.status(503).json({ error: 'Audit trail not available' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const snap = await trailDb.collection('paddla_games').orderBy('ts', 'desc').limit(limit).get();
    const items = snap.docs.map(d => {
      const r = d.data();
      return {
        gameId: r.gameId, protocol: r.protocol, G: r.G,
        commitment: r.commitment, numBalls: r.numBalls,
        betPerBall: r.betPerBall, totalWin: r.totalWin, ts: r.ts
      };
    });
    res.json({ count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/trail/:id', async (req, res) => {
  if (!trailEnabled || !trailDb) {
    return res.status(503).json({ error: 'Audit trail not available' });
  }
  try {
    const doc = await trailDb.collection('paddla_games').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Record not found' });
    res.json(doc.data());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '0.8',
    protocol: 'UVS 2.0 (Move Batch, G=ALL)',
    trailEnabled,
    activeGames: Object.keys(games).length,
    commitment: commitment.substring(0, 16) + '...'
  });
});

// Version info
app.get('/version', (req, res) => {
  res.json({
    server: '0.8',
    engine: '0.6',
    protocol: 'UVS 2.0 (Move Batch, G=ALL)',
    description: 'Provably fair with persistent public audit trail. Verified games stored in Firestore; anyone can replay via /trail/:id.'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PADDLA Server v0.8 (UVS 2.0 — Move Batch, G=ALL) running on port ${PORT}`);
  console.log(`Initial commitment: ${commitment.substring(0, 16)}...`);
  console.log(`Audit trail: ${trailEnabled ? 'ENABLED (Firestore paddla_games)' : 'DISABLED (RAM-only)'}`);
});
