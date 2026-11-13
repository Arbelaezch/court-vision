/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ARCHETYPES_FILE, PASS_TUNING_DATA } from './data/archetypes';
import { loadPassTuning } from './passing';
import { ContentValidationError } from './validate';

describe('loadPassTuning', () => {
  it('returns a new object equal to the bundled data', () => {
    const tuning = loadPassTuning();
    expect(tuning).not.toBe(PASS_TUNING_DATA);
    expect(tuning.lob).not.toBe(PASS_TUNING_DATA.lob);
    expect(tuning).toEqual(PASS_TUNING_DATA);
  });

  it.each([
    ['missing lob.apexHeightM', (d: any) => delete d.lob.apexHeightM, 'passing.lob.apexHeightM'],
    [
      'lob apex below the lob release height',
      (d: any) => ((d.lob.releaseHeightM = 3), (d.lob.apexHeightM = 2.5)),
      'passing.lob.apexHeightM',
    ],
    ['jitter of 0.5', (d: any) => (d.jitter = 0.5), 'passing.jitter'],
    [
      'non-numeric chestPass.speedMps',
      (d: any) => (d.chestPass.speedMps = 'fast'),
      'passing.chestPass.speedMps',
    ],
    ['unknown top-level key', (d: any) => (d.curve = 1), 'passing.curve'],
    ['unknown bouncePass key', (d: any) => (d.bouncePass.spin = 1), 'passing.bouncePass.spin'],
  ])('rejects %s naming file and field', (_label, mutate, field) => {
    const data = structuredClone(PASS_TUNING_DATA);
    mutate(data);
    let error: unknown;
    try {
      loadPassTuning({ file: ARCHETYPES_FILE, data });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const message = (error as Error).message;
    expect(message).toContain('src/content/data/archetypes.ts');
    expect(message).toContain(field);
  });
});
