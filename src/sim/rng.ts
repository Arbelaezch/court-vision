// Seeded RNG (mulberry32). This is the only source of randomness in the sim: never use Math.random.
// State is a single uint32 in a plain object so it deep-compares, serializes and clones cleanly.

export interface RngState {
  s: number;
}

export const MAX_SEED = 0xffffffff;

export function createRng(seed: number): RngState {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new Error(`Court Vision: RNG seed must be an integer in [0, ${MAX_SEED}], got ${seed}`);
  }
  return { s: seed };
}

/** Advances the state (mutates) and returns a uint32 in [0, 2^32). */
export function nextUint32(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / 2 ** 32;
}

/** Integer in [min, maxExclusive). */
export function nextInt(rng: RngState, min: number, maxExclusive: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || maxExclusive <= min) {
    throw new Error(
      `Court Vision: nextInt needs integers with maxExclusive > min, got ${min}, ${maxExclusive}`,
    );
  }
  return min + Math.floor(nextFloat(rng) * (maxExclusive - min));
}

/** Float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error(`Court Vision: nextRange needs finite min <= max, got ${min}, ${max}`);
  }
  return min + nextFloat(rng) * (max - min);
}

export function pickOne<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Court Vision: pickOne needs a non-empty list');
  }
  const item = items[nextInt(rng, 0, items.length)];
  if (item === undefined) {
    throw new Error('Court Vision: pickOne needs a non-empty list');
  }
  return item;
}

export function cloneRng(rng: RngState): RngState {
  return { s: rng.s };
}
