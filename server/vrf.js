/**
 * PADDLA VRF Module
 * Provably Fair random generation using HMAC-based commitment scheme
 * 
 * Scheme:
 * 1. Server generates server_seed, publishes hash(server_seed) as commitment
 * 2. Client provides client_seed
 * 3. game_seed = HMAC(server_seed, client_seed + game_id)
 * 4. After game, server reveals server_seed
 * 5. Client verifies: hash(server_seed) === commitment
 *                     HMAC(server_seed, client_seed + game_id) === game_seed
 */

const crypto = require('crypto');

class VRF {
  constructor(serverSeed = null) {
    // Generate or use provided server seed
    this.serverSeed = serverSeed || crypto.randomBytes(32).toString('hex');
    // Commitment = hash of server seed (published before game)
    this.commitment = this.hash(this.serverSeed);
  }

  // SHA-256 hash
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // HMAC-SHA256
  hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  // Generate game seed from client input
  generateGameSeed(clientSeed, gameId) {
    const input = `${clientSeed}:${gameId}`;
    const gameSeedHex = this.hmac(this.serverSeed, input);
    // Convert first 8 bytes to integer for JavaRandom seed
    const gameSeedInt = parseInt(gameSeedHex.substring(0, 12), 16);
    return {
      seed: gameSeedInt,
      seedHex: gameSeedHex,
      input,
      commitment: this.commitment
    };
  }

  // Get proof for verification (revealed after game)
  getProof() {
    return {
      serverSeed: this.serverSeed,
      commitment: this.commitment
    };
  }

  // Static verification (client-side)
  static verify(serverSeed, clientSeed, gameId, expectedCommitment, expectedSeedHex) {
    // Verify commitment
    const commitment = crypto.createHash('sha256').update(serverSeed).digest('hex');
    if (commitment !== expectedCommitment) {
      return { valid: false, error: 'Commitment mismatch' };
    }

    // Verify game seed
    const input = `${clientSeed}:${gameId}`;
    const gameSeedHex = crypto.createHmac('sha256', serverSeed).update(input).digest('hex');
    if (gameSeedHex !== expectedSeedHex) {
      return { valid: false, error: 'Game seed mismatch' };
    }

    return { valid: true };
  }

  // Generate verification data for client
  getVerificationData(clientSeed, gameId) {
    const gameData = this.generateGameSeed(clientSeed, gameId);
    return {
      commitment: this.commitment,
      clientSeed,
      gameId,
      gameSeedHex: gameData.seedHex,
      gameSeed: gameData.seed,
      // This is revealed AFTER game ends
      serverSeed: this.serverSeed
    };
  }
}

// Browser-compatible verification (no crypto module)
const browserVerify = `
// Browser verification code
async function verifyGame(serverSeed, clientSeed, gameId, expectedCommitment, expectedSeedHex) {
  // Hash function using Web Crypto API
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // HMAC function using Web Crypto API
  async function hmacSha256(key, message) {
    const keyBuffer = new TextEncoder().encode(key);
    const msgBuffer = new TextEncoder().encode(message);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Verify commitment
  const commitment = await sha256(serverSeed);
  if (commitment !== expectedCommitment) {
    return { valid: false, error: 'Commitment mismatch' };
  }

  // Verify game seed
  const input = clientSeed + ':' + gameId;
  const gameSeedHex = await hmacSha256(serverSeed, input);
  if (gameSeedHex !== expectedSeedHex) {
    return { valid: false, error: 'Game seed mismatch' };
  }

  return { valid: true };
}
`;

module.exports = { VRF, browserVerify };
