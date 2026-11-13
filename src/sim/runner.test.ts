import { describe, expect, it } from 'vitest';
import { BASELINE_Z, SIDELINE_X, createGame, runHeadless } from './index';
import type { SimInput } from './index';
import { TEST_MOVEMENT } from './testMovement';

const movement = TEST_MOVEMENT;

// East for 30 ticks, then east and toward the basket for 60 ticks, then release and brake to a stop.
const TIMELINE: SimInput[] = [
  { tick: 0, action: { type: 'move', x: 1, z: 0 } },
  { tick: 30, action: { type: 'move', x: 0.6, z: -0.8 } },
  { tick: 90, action: { type: 'move', x: 0, z: 0 } },
];

function run(seed: number, inputs: readonly SimInput[] = TIMELINE) {
  return runHeadless({ seed, ticks: 180, inputs, shotClockSeconds: 24, movement });
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
    const start = createGame({ seed: 12345, movement }).players[0]!.pos;
    const p0 = final.players[0]!;
    expect(p0.pos.x).toBeGreaterThan(start.x + 2);
    expect(p0.pos.z).toBeLessThan(start.z);
    expect(Math.abs(p0.pos.x)).toBeLessThan(SIDELINE_X);
    expect(p0.pos.z).toBeGreaterThan(BASELINE_Z);
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
      movement,
    });
    expect(final.players[0]!.moveIntent).toEqual({ x: 0, z: 1 });
  });

  it('does not mutate the inputs', () => {
    const inputs = structuredClone(TIMELINE);
    run(12345, inputs);
    expect(inputs).toStrictEqual(TIMELINE);
  });

  it('returns the initial game for ticks 0', () => {
    expect(
      runHeadless({ seed: 9, ticks: 0, inputs: [], shotClockSeconds: 24, movement }),
    ).toStrictEqual(createGame({ seed: 9, shotClockSeconds: 24, movement }));
  });

  it('throws for an unsorted timeline', () => {
    const inputs: SimInput[] = [
      { tick: 5, action: { type: 'move', x: 1, z: 0 } },
      { tick: 2, action: { type: 'move', x: 0, z: 0 } },
    ];
    expect(() => runHeadless({ seed: 1, ticks: 10, inputs, movement })).toThrow(/sorted by tick/);
  });

  it.each([10, 11, 2.5, -1])('throws for input tick %s with ticks 10', (tick) => {
    const inputs: SimInput[] = [{ tick, action: { type: 'move', x: 1, z: 0 } }];
    expect(() => runHeadless({ seed: 1, ticks: 10, inputs, movement })).toThrow(/input tick/);
  });

  it.each([-1, 1.5, NaN])('throws for ticks %s', (ticks) => {
    expect(() => runHeadless({ seed: 1, ticks, inputs: [], movement })).toThrow(/ticks must be/);
  });
});
