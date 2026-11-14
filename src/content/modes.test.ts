import { describe, expect, it } from 'vitest';
import { BUNDLED_MODE_SOURCES, MODE_RULES, loadMode, loadModes } from './modes';
import { CUE_LEVELS } from './plays';
import { ContentValidationError } from './validate';

const PRACTICE = {
  id: 'practice',
  name: 'Practice',
  rules: 'practice',
  cueLevel: 'full',
  defense: 'cones',
  speedMultiplier: 1,
  shotClockSeconds: null,
};

const LIVE_PLAY = {
  id: 'livePlay',
  name: 'Live Play',
  rules: 'scrimmage',
  cueLevel: 'none',
  defense: 'live',
  speedMultiplier: 1,
  shotClockSeconds: 24,
};

function source(data: unknown, file = 'src/content/data/modes/test.ts') {
  return { file, data };
}

describe('bundled modes', () => {
  it('loads exactly the Practice config', () => {
    expect(loadModes()).toEqual({ practice: PRACTICE });
  });

  it('registers every mode file, named after its id', () => {
    const found = Object.keys(import.meta.glob('./data/modes/*.ts'))
      .map((p) => p.replace('./data/modes/', 'src/content/data/modes/'))
      .sort();
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found).toEqual(BUNDLED_MODE_SOURCES.map((s) => s.file).sort());
    for (const s of BUNDLED_MODE_SOURCES) {
      const [mode] = Object.values(loadModes([s]));
      expect(s.file).toBe(`src/content/data/modes/${mode?.id}.ts`);
    }
  });

  it('only uses known cue levels and rule sets', () => {
    for (const mode of Object.values(loadModes())) {
      expect(CUE_LEVELS).toContain(mode.cueLevel);
      expect(MODE_RULES).toContain(mode.rules);
    }
  });

  it('loads a Live Play config with cue level None without code changes', () => {
    const table = loadModes([
      ...BUNDLED_MODE_SOURCES,
      source(LIVE_PLAY, 'src/content/data/modes/livePlay.ts'),
    ]);
    expect(table['livePlay']).toEqual(LIVE_PLAY);
  });

  it('loadMode throws for an unknown id', () => {
    expect(() => loadMode('nope')).toThrow(/Court Vision: unknown mode nope/);
    expect(() => loadMode('toString')).toThrow(/Court Vision: unknown mode toString/);
    expect(loadMode('practice').id).toBe('practice');
  });
});

describe('mode validation', () => {
  const cases: [string, unknown, RegExp][] = [
    ['unknown field', { ...PRACTICE, extra: 1 }, /at practice\.extra/],
    ['bad rules', { ...PRACTICE, rules: 'freePlay' }, /at practice\.rules/],
    ['bad cueLevel', { ...PRACTICE, cueLevel: 'minimal' }, /at practice\.cueLevel/],
    ['bad defense', { ...PRACTICE, defense: 'zone' }, /at practice\.defense/],
    ['speed too low', { ...PRACTICE, speedMultiplier: 0 }, /at practice\.speedMultiplier/],
    ['speed too high', { ...PRACTICE, speedMultiplier: 3 }, /at practice\.speedMultiplier/],
    ['clock zero', { ...PRACTICE, shotClockSeconds: 0 }, /at practice\.shotClockSeconds/],
    [
      'clock missing',
      { ...PRACTICE, shotClockSeconds: undefined },
      /at practice\.shotClockSeconds/,
    ],
    ['bad id', { ...PRACTICE, id: 'Practice' }, /at mode\.id/],
  ];

  it.each(cases)('rejects %s', (_name, data, message) => {
    expect(() => loadModes([source(data)])).toThrow(ContentValidationError);
    expect(() => loadModes([source(data)])).toThrow(message);
  });

  it('rejects a duplicate id across two sources', () => {
    expect(() =>
      loadModes([source(PRACTICE, 'a.ts'), source({ ...PRACTICE, name: 'Other' }, 'b.ts')]),
    ).toThrow(/duplicate mode id "practice" \(also in a\.ts\)/);
  });
});
