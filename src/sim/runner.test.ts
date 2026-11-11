import { describe, expect, it } from 'vitest';
import { createGame, runHeadless } from './index';
import type { SimInput } from './index';

// 2 m east over 30 ticks, then 2.4 m east and 3.2 m toward the basket over 60 ticks, then stopped.
const TIMELINE: SimInput[] = [
  { tick: 0, action: { type: 'move', x: 1, z: 0 } },
  { tick: 30, action: { type: 'move', x: 0.6, z: -0.8 } },
  { tick: 90, action: { type: 'move', x: 0, z: 0 } },
];

function run(seed: number, inputs: readonly SimInput[] = TIMELINE) {
  return runHeadless({ seed, ticks: 180, inputs, shotClockSeconds: 24 });
}

describe('runHeadless', () => {
  it('gives identical final states for the same seed and inputs', () => {
    expect(run(12345)).toStrictEqual(run(12345));
  });

  it('gives different final states for different seeds', () => {
    expect(run(12345)).not.toEqual(run(54321));
  });

  it('applies the timeline to the final state', () => {
    const final = run(12345);
    expect(final.tick).toBe(180);
    expect(final.shotClockTicks).toBe(1260);
    const p0 = final.players[0]!;
    expect(p0.pos.x).toBeCloseTo(4.4);
    expect(p0.pos.z).toBeCloseTo(-1.2);
    expect(p0.vel).toEqual({ x: 0, z: 0 });
  });

  it('applies same-tick inputs in timeline order', () => {
    const final = runHeadless({
      seed: 1,
      ticks: 1,
      inputs: [
        { tick: 0, action: { type: 'move', x: 1, z: 0 } },
        { tick: 0, action: { type: 'move', x: 0, z: 1 } },
      ],
    });
    expect(final.players[0]!.moveIntent).toEqual({ x: 0, z: 1 });
  });

  it('does not mutate the inputs', () => {
    const inputs = structuredClone(TIMELINE);
    run(12345, inputs);
    expect(inputs).toStrictEqual(TIMELINE);
  });

  it('returns the initial game for ticks 0', () => {
    expect(runHeadless({ seed: 9, ticks: 0, inputs: [], shotClockSeconds: 24 })).toStrictEqual(
      createGame({ seed: 9, shotClockSeconds: 24 }),
    );
  });

  it('throws for an unsorted timeline', () => {
    const inputs: SimInput[] = [
      { tick: 5, action: { type: 'move', x: 1, z: 0 } },
      { tick: 2, action: { type: 'move', x: 0, z: 0 } },
    ];
    expect(() => runHeadless({ seed: 1, ticks: 10, inputs })).toThrow(/sorted by tick/);
  });

  it.each([10, 11, 2.5, -1])('throws for input tick %s with ticks 10', (tick) => {
    const inputs: SimInput[] = [{ tick, action: { type: 'move', x: 1, z: 0 } }];
    expect(() => runHeadless({ seed: 1, ticks: 10, inputs })).toThrow(/input tick/);
  });

  it.each([-1, 1.5, NaN])('throws for ticks %s', (ticks) => {
    expect(() => runHeadless({ seed: 1, ticks, inputs: [] })).toThrow(/ticks must be/);
  });
});
