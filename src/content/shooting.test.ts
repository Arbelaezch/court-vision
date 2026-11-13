/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ARCHETYPES_FILE, SHOT_TUNING_DATA } from './data/archetypes';
import { loadShotTuning } from './shooting';
import { ContentValidationError } from './validate';

describe('loadShotTuning', () => {
  it('returns a new object equal to the bundled data', () => {
    const tuning = loadShotTuning();
    expect(tuning).not.toBe(SHOT_TUNING_DATA);
    expect(tuning).toEqual(SHOT_TUNING_DATA);
  });

  it.each([
    ['unknown key', (d: any) => (d.curve = 1), 'shooting.curve'],
    ['missing key', (d: any) => delete d.maxRangeM, 'shooting.maxRangeM'],
    ['contestWeight of 2', (d: any) => (d.contestWeight = 2), 'shooting.contestWeight'],
    [
      'non-integer catchAndShootWindowTicks',
      (d: any) => (d.catchAndShootWindowTicks = 12.5),
      'shooting.catchAndShootWindowTicks',
    ],
    [
      'greatMinScore equal to goodMinScore',
      (d: any) => (d.greatMinScore = d.goodMinScore),
      'shooting.greatMinScore',
    ],
    [
      'badMakeChance above goodMakeChance',
      (d: any) => (d.badMakeChance = 0.6),
      'shooting.goodMakeChance',
    ],
    [
      'goodMakeChance above greatMakeChance',
      (d: any) => (d.goodMakeChance = 0.9),
      'shooting.greatMakeChance',
    ],
    [
      'minMakeChance above maxMakeChance',
      (d: any) => ((d.minMakeChance = 0.99), (d.maxMakeChance = 0.5)),
      'shooting.minMakeChance',
    ],
  ])('rejects %s naming file and field', (_label, mutate, field) => {
    const data = structuredClone(SHOT_TUNING_DATA);
    mutate(data);
    let error: unknown;
    try {
      loadShotTuning({ file: ARCHETYPES_FILE, data });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const message = (error as Error).message;
    expect(message).toContain('src/content/data/archetypes.ts');
    expect(message).toContain(field);
  });
});
