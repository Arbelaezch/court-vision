import { describe, expect, it } from 'vitest';
import {
  advanceStepper,
  createStepper,
  stepperAlpha,
  stepperSimSeconds,
  type StepperState,
} from './stepper';

import { MAX_FRAME_DELTA_MS, SIM_HZ } from './stepper';

function run(speed: number, deltas: number[]): StepperState {
  const stepper = createStepper(speed);
  let sum = 0;
  for (const d of deltas) sum += advanceStepper(stepper, d);
  expect(sum).toBe(stepper.stepsTaken);
  return stepper;
}

const partitions: [string, number[]][] = [
  ['8x250', Array<number>(8).fill(250)],
  ['125x16', Array<number>(125).fill(16)],
  ['[16,17,17]x40', Array.from({ length: 120 }, (_, i) => [16, 17, 17][i % 3] as number)],
  ['2000x1', Array<number>(2000).fill(1)],
  ['120x(1000/60)', Array<number>(120).fill(1000 / 60)],
];

describe('stepper', () => {
  it.each(partitions)('gives 120 steps at speed 1 for partition %s', (_name, deltas) => {
    expect(run(1, deltas).stepsTaken).toBe(120);
  });

  it.each(partitions)('gives 102 steps at speed 0.85 for partition %s', (_name, deltas) => {
    expect(run(0.85, deltas).stepsTaken).toBe(102);
  });

  it('scales sim time by the speed multiplier', () => {
    const normal = run(1, Array<number>(8).fill(250));
    const slow = run(0.85, Array<number>(8).fill(250));
    expect(stepperSimSeconds(normal)).toBeCloseTo(2);
    expect(stepperSimSeconds(slow)).toBeCloseTo(1.7);
    expect(slow.stepsTaken).toBeLessThan(normal.stepsTaken);
  });

  it('clamps a long frame to the maximum delta', () => {
    expect(advanceStepper(createStepper(1), 1000)).toBe(15);
  });

  it.each([3000, 5000, 30000])(
    'bounds a several-second frame (%s ms) by the maximum catch-up steps',
    (d) => {
      const bound = Math.floor((MAX_FRAME_DELTA_MS * SIM_HZ) / 1000);
      expect(advanceStepper(createStepper(1), d)).toBeLessThanOrEqual(bound);
      expect(advanceStepper(createStepper(1), d)).toBe(15);
      expect(advanceStepper(createStepper(0.85), d)).toBe(12);
    },
  );

  it('reports interpolation alpha within [0, 1)', () => {
    const s = createStepper(1);
    expect(advanceStepper(s, 8)).toBe(0);
    expect(s.stepsTaken).toBe(0);
    expect(stepperAlpha(s)).toBeCloseTo(0.48);
    advanceStepper(s, 1000 / 60);
    const alpha = stepperAlpha(s);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });

  it('returns 0 steps for a zero delta', () => {
    expect(advanceStepper(createStepper(1), 0)).toBe(0);
  });

  it.each([-1, NaN, Infinity])('throws for invalid delta %s', (delta) => {
    expect(() => advanceStepper(createStepper(1), delta)).toThrow(/frame delta/);
  });

  it.each([0, -0.5, NaN, Infinity])('throws for invalid speed %s', (speed) => {
    expect(() => createStepper(speed)).toThrow(/stepper speed/);
  });
});
