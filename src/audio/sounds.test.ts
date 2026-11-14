import { describe, it, expect } from 'vitest';
import {
  createFakeAudioContext,
  pathReaches,
  type FakeBufferSource,
  type FakeGain,
  type FakeNode,
  type FakeOscillator,
} from './fakeAudioContext';
import type { SoundId } from './eventSounds';
import { renderNoise, VOICES } from './sounds';

const ids = Object.keys(VOICES) as SoundId[];

describe('procedural voices', () => {
  it.each(ids)('%s starts at >= t, stops within t + 1 s and reaches the output', (id) => {
    const ctx = createFakeAudioContext();
    const out: FakeGain = ctx.createGain();
    const before = ctx.nodes.length;
    const t = 2;
    VOICES[id](ctx, out, t);
    const fresh = ctx.nodes.slice(before);
    expect(fresh.length).toBeGreaterThan(0);

    const sources = fresh.filter(
      (n): n is FakeOscillator | FakeBufferSource =>
        n.kind === 'oscillator' || n.kind === 'bufferSource',
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.startedAt).not.toBeNull();
      expect(s.startedAt!).toBeGreaterThanOrEqual(t);
      expect(s.stoppedAt!).toBeGreaterThan(s.startedAt!);
      expect(s.stoppedAt!).toBeLessThanOrEqual(t + 1);
      expect(pathReaches(s as FakeNode, out)).toBe(true);
    }
  });

  it('noise is deterministic and the cached buffer is reused per context', () => {
    expect(renderNoise(256)).toEqual(renderNoise(256));
    const ctx = createFakeAudioContext();
    const out = ctx.createGain();
    VOICES.swish(ctx, out, 0);
    VOICES.swish(ctx, out, 1);
    const srcs = ctx.nodes.filter((n): n is FakeBufferSource => n.kind === 'bufferSource');
    expect(srcs).toHaveLength(2);
    expect(srcs[0]!.buffer).toBe(srcs[1]!.buffer);
    for (const v of renderNoise(256)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
});
