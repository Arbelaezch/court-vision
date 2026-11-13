/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ARCHETYPES_FILE, MOVEMENT_TUNING_DATA } from './data/archetypes';
import { loadMovementTuning } from './movement';
import { ContentValidationError } from './validate';

describe('loadMovementTuning', () => {
  it('loads the bundled tuning with all four numbers', () => {
    const tuning = loadMovementTuning();
    expect(tuning.sprintSpeedMultiplier).toBeGreaterThan(1);
    expect(tuning.brakingMultiplier).toBeGreaterThanOrEqual(1);
    expect(tuning.sprintDurationS).toBeGreaterThan(0);
    expect(tuning.staminaRefillS).toBeGreaterThan(0);
  });

  it('returns a new object rather than the input', () => {
    const tuning = loadMovementTuning();
    expect(tuning).not.toBe(MOVEMENT_TUNING_DATA);
    expect(tuning).toEqual(MOVEMENT_TUNING_DATA);
  });

  it.each([
    [
      'missing sprintDurationS',
      (d: any) => delete d.sprintDurationS,
      'movement.sprintDurationS',
    ],
    [
      'sprintSpeedMultiplier below 1',
      (d: any) => (d.sprintSpeedMultiplier = 0.9),
      'movement.sprintSpeedMultiplier',
    ],
    [
      'non-numeric staminaRefillS',
      (d: any) => (d.staminaRefillS = 'slow'),
      'movement.staminaRefillS',
    ],
    ['unknown key', (d: any) => (d.jumpBoost = 2), 'movement.jumpBoost'],
  ])('rejects %s naming file and field', (_label, mutate, field) => {
    const data = structuredClone(MOVEMENT_TUNING_DATA);
    mutate(data);
    let error: unknown;
    try {
      loadMovementTuning({ file: ARCHETYPES_FILE, data });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const message = (error as Error).message;
    expect(message).toContain('src/content/data/archetypes.ts');
    expect(message).toContain(field);
  });
});
