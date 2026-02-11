/**
 * PADDLA Engine - Core utilities
 * JavaRandom + math helpers
 */

// Floating point precision
const FP_ROUND = 1e10;
function fpRound(v) {
  return Math.round(v * FP_ROUND) / FP_ROUND;
}

// Java-compatible RNG (same as Ball Rush server)
class JavaRandom {
  constructor(seed) {
    this.seed = BigInt(seed) ^ 0x5DEECE66Dn;
    this.seed = this.seed & 0xFFFFFFFFFFFFn;
  }

  next(bits) {
    this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn;
    return Number(this.seed >> BigInt(48 - bits));
  }

  nextDouble() {
    return (this.next(26) * 0x8000000 + this.next(27)) / 0x20000000000000;
  }

  nextInt(bound) {
    return Math.floor(this.nextDouble() * bound);
  }
}

// Distance helper
function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

// Clamp value to range
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JavaRandom, fpRound, dist, clamp, FP_ROUND };
}
