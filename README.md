# PADDLA 🏓

**Physics-based Arcade Game with Provably Fair Verification**

## What is PADDLA?

PADDLA is a physics-based arcade game where you control a bumper to direct balls into goal zones. Features:

- 🎮 Real-time physics simulation
- 🔒 **Provably Fair** - cryptographic verification
- 🏆 Leaderboard (Firebase)
- 🤖 AI strategies for automated play
- 📱 Mobile-friendly

## Provably Fair Protocol v2.0

PADDLA uses **Input-Seeded Randomness** - a novel approach for interactive games:

```
Traditional Provably Fair:
  random = f(seed)  ← player knows seed → can predict

PADDLA's approach:
  random = f(seed, bumper_position)  ← player must commit to position first!
```

**Why this works:**
- Player cannot predict random outcomes without choosing bumper position
- Once position is chosen, random outcome is fixed
- Server replays with same seed + input log → must match

See [PROVABLY_FAIR.md](docs/PROVABLY_FAIR.md) for full protocol details.

## Architecture

```
PADDLA/
├── client/           # Browser client (single HTML file)
│   └── index.html    # Game UI + engine
├── server/           # Node.js server
│   ├── index.js      # Express API
│   └── engine.js     # Physics engine wrapper
├── engine/           # Shared physics engine
│   └── core.js       # Input-seeded RNG + game logic
├── docs/
│   └── PROVABLY_FAIR.md
└── simulation/       # Testing tools
```

## Running Locally

```bash
# Server
cd server
npm install
npm start

# Client
# Open client/index.html in browser
# Or access http://localhost:3000
```

## Protocol Flow

1. **GET /commitment** - Client records SHA256(serverSeed) BEFORE game
2. **POST /game/start** - Client sends clientSeed, gets gameSeedHex
3. **PLAY** - Client runs physics locally, logs every bumper position
4. **POST /game/finish** - Server replays, verifies, reveals serverSeed

## Verification

After game, client can verify:
1. `SHA256(serverSeed) === recorded_commitment`
2. `HMAC(serverSeed, clientSeed:gameId) === gameSeedHex`
3. Replay with gameSeedHex + inputLog produces same totalWin

## Live Demo

- **Client:** https://constantine.ch/PADDLA/
- **Server:** https://paddla.onrender.com

## License

MIT
