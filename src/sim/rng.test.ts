import { describe, expect, it } from 'vitest';
import { cloneRng, createRng, nextFloat, nextInt, nextRange, nextUint32, pickOne } from './index';

function draw(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => nextUint32(rng));
}

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(42, 10)).toEqual(draw(42, 10));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
    expect(draw(0, 5)).not.toEqual(draw(1, 5));
  });

  it('matches pinned known answers for seed 42', () => {
    expect(draw(42, 3)).toEqual(KNOWN_42);
  });

  it('keeps nextFloat in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('keeps nextInt in range and hits every value', () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const n = nextInt(rng, 3, 7);
      expect([3, 4, 5, 6]).toContain(n);
      seen.add(n);
    }
    expect(seen.size).toBe(4);
  });

  it('rejects invalid nextInt and nextRange arguments', () => {
    const rng = createRng(1);
    expect(() => nextInt(rng, 1.5, 4)).toThrow();
    expect(() => nextInt(rng, 3, 3)).toThrow();
    expect(() => nextRange(rng, 2, 1)).toThrow();
    expect(() => nextRange(rng, 0, Infinity)).toThrow();
  });

  it('keeps nextRange within [min, max)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = nextRange(rng, -2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it('pickOne returns a list element and throws on an empty list', () => {
    const rng = createRng(5);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pickOne(rng, items));
    }
    expect(() => pickOne(rng, [])).toThrow(/non-empty/);
  });

  it('cloneRng copies are independent', () => {
    const rng = createRng(11);
    nextUint32(rng);
    const copy = cloneRng(rng);
    const before = rng.s;
    const fromCopy = nextUint32(copy);
    expect(rng.s).toBe(before);
    expect(nextUint32(rng)).toBe(fromCopy);
  });

  it.each([-1, 1.5, NaN, 2 ** 32, Infinity])('rejects seed %s', (seed) => {
    expect(() => createRng(seed)).toThrow(/RNG seed/);
  });

  it('accepts seed 0', () => {
    expect(createRng(0)).toEqual({ s: 0 });
  });
});

// Pinned from the implementation to catch accidental algorithm changes.
const KNOWN_42: number[] = [2581720956, 1925393290, 3661312704];
