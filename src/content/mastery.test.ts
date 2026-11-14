/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { MASTERY_FILE, MASTERY_TUNING_DATA } from './data/mastery';
import { loadMasteryTuning } from './mastery';
import { ContentValidationError } from './validate';

describe('loadMasteryTuning', () => {
  it('loads the bundled threshold', () => {
    expect(loadMasteryTuning().masteredSuccesses).toBe(10);
  });

  it('returns a new object rather than the input', () => {
    const tuning = loadMasteryTuning();
    expect(tuning).not.toBe(MASTERY_TUNING_DATA);
    expect(tuning).toEqual(MASTERY_TUNING_DATA);
  });

  it.each([
    ['missing key', (d: any) => delete d.masteredSuccesses, 'mastery.masteredSuccesses'],
    ['zero', (d: any) => (d.masteredSuccesses = 0), 'mastery.masteredSuccesses'],
    ['fraction', (d: any) => (d.masteredSuccesses = 1.5), 'mastery.masteredSuccesses'],
    ['non-number', (d: any) => (d.masteredSuccesses = 'ten'), 'mastery.masteredSuccesses'],
    ['unknown key', (d: any) => (d.extra = 2), 'mastery.extra'],
  ])('rejects %s naming file and field', (_label, mutate, field) => {
    const data = structuredClone(MASTERY_TUNING_DATA);
    mutate(data);
    let error: unknown;
    try {
      loadMasteryTuning({ file: MASTERY_FILE, data });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const message = (error as Error).message;
    expect(message).toContain('src/content/data/mastery.ts');
    expect(message).toContain(field);
  });
});
