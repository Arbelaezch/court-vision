import { describe, it, expect } from 'vitest';
import { MUSIC_LOOP_S, MUSIC_PEAK, renderMusicLoop } from './music';

describe('music loop', () => {
  const rate = 8000;
  const s = renderMusicLoop(rate);

  it('has the exact loop length', () => {
    expect(s.length).toBe(Math.round(MUSIC_LOOP_S * rate));
  });

  it('keeps samples finite and in [-1, 1] (and within the peak)', () => {
    let max = 0;
    for (const v of s) {
      expect(Number.isFinite(v)).toBe(true);
      max = Math.max(max, Math.abs(v));
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(MUSIC_PEAK + 1e-6);
    expect(max).toBeGreaterThan(0.05);
  });

  it('starts and ends near silence', () => {
    expect(Math.abs(s[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(s[s.length - 1]!)).toBeLessThan(1e-3);
  });

  it('wrap step is no larger than the largest in-buffer step', () => {
    let maxStep = 0;
    for (let i = 1; i < s.length; i += 1) maxStep = Math.max(maxStep, Math.abs(s[i]! - s[i - 1]!));
    expect(Math.abs(s[0]! - s[s.length - 1]!)).toBeLessThanOrEqual(maxStep);
  });

  it('is deterministic', () => {
    expect(renderMusicLoop(rate)).toEqual(s);
  });
});
