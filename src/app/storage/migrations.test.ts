import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../input';
import { CURRENT_VERSION, MIGRATIONS, migrateV1ToV2 } from './migrations';

const V1_FIXTURE: Record<string, unknown> = {
  version: 1,
  progress: { plays: { 'give-and-go': { practice: { attempts: 3, successes: 2 } } } },
  settings: {
    passTargeting: 'aim',
    doubleClickWindowMs: 300,
    aimSensitivity: 1.5,
    volume: 0.4,
    musicOn: false,
    sfxOn: true,
    showCues: false,
  },
  bindings: DEFAULT_BINDINGS.map((b) => ({ ...b })),
  seenTooltips: ['sprint'],
};

describe('migrateV1ToV2', () => {
  it('nests audio settings and replaces showCues with per-cue toggles', () => {
    const migrated = migrateV1ToV2(V1_FIXTURE);
    expect(migrated).toEqual({
      version: 2,
      progress: V1_FIXTURE.progress,
      settings: {
        passTargeting: 'aim',
        doubleClickWindowMs: 300,
        aimSensitivity: 1.5,
        audio: { volume: 0.4, musicOn: false, sfxOn: true },
        cues: { floorArrows: false, targetRings: false, prompts: false },
      },
      bindings: V1_FIXTURE.bindings,
      seenTooltips: ['sprint'],
    });
    const settings = migrated.settings as Record<string, unknown>;
    expect(settings).not.toHaveProperty('showCues');
    expect(settings).not.toHaveProperty('volume');
    expect(settings).not.toHaveProperty('musicOn');
    expect(settings).not.toHaveProperty('sfxOn');
  });

  it('does not mutate its input', () => {
    const input = structuredClone(V1_FIXTURE);
    migrateV1ToV2(input);
    expect(input).toEqual(V1_FIXTURE);
  });

  it('passes a non-object settings through without throwing', () => {
    expect(migrateV1ToV2({ version: 1, settings: 'oops' })).toEqual({
      version: 2,
      settings: 'oops',
    });
    expect(migrateV1ToV2({ version: 1 })).toEqual({ version: 2 });
  });
});

describe('MIGRATIONS', () => {
  it('registers the v1 step and targets version 2', () => {
    expect(MIGRATIONS[1]).toBe(migrateV1ToV2);
    expect(CURRENT_VERSION).toBe(2);
  });
});
