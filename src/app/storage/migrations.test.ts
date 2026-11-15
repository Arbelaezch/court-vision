import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../input';
import {
  CURRENT_VERSION,
  MIGRATIONS,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
} from './migrations';
import { SECTION_VALIDATORS } from './schema';

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

const V2_FIXTURE: Record<string, unknown> = {
  version: 2,
  progress: { plays: { 'give-and-go': { practice: { attempts: 3, successes: 2 } } } },
  settings: {
    passTargeting: 'aim',
    doubleClickWindowMs: 300,
    aimSensitivity: 1.5,
    audio: { volume: 0.4, musicOn: true, sfxOn: false },
    cues: { floorArrows: true, targetRings: false, prompts: true },
  },
  bindings: DEFAULT_BINDINGS.map((b) => ({ ...b })),
  seenTooltips: ['sprint'],
};

describe('migrateV2ToV3', () => {
  it('turns music off and keeps volume, sfxOn and everything else', () => {
    expect(migrateV2ToV3(V2_FIXTURE)).toEqual({
      ...V2_FIXTURE,
      version: 3,
      settings: {
        passTargeting: 'aim',
        doubleClickWindowMs: 300,
        aimSensitivity: 1.5,
        audio: { volume: 0.4, musicOn: false, sfxOn: false },
        cues: { floorArrows: true, targetRings: false, prompts: true },
      },
    });
  });

  it('does not mutate its input', () => {
    const input = structuredClone(V2_FIXTURE);
    migrateV2ToV3(input);
    expect(input).toEqual(V2_FIXTURE);
  });

  it('only bumps the version when settings or settings.audio is not an object', () => {
    expect(migrateV2ToV3({ version: 2 })).toEqual({ version: 3 });
    expect(migrateV2ToV3({ version: 2, settings: 'oops' })).toEqual({
      version: 3,
      settings: 'oops',
    });
    expect(migrateV2ToV3({ version: 2, settings: { audio: [] } })).toEqual({
      version: 3,
      settings: { audio: [] },
    });
  });
});

const V3_FIXTURE: Record<string, unknown> = {
  ...V2_FIXTURE,
  version: 3,
  settings: {
    passTargeting: 'aim',
    doubleClickWindowMs: 300,
    aimSensitivity: 1.5,
    audio: { volume: 0.4, musicOn: true, sfxOn: false },
    cues: { floorArrows: false, targetRings: true, prompts: false },
  },
};

describe('migrateV3ToV4', () => {
  it('adds reduceMotion off and keeps audio, cues and everything else', () => {
    expect(migrateV3ToV4(V3_FIXTURE)).toEqual({
      ...V3_FIXTURE,
      version: 4,
      settings: {
        passTargeting: 'aim',
        doubleClickWindowMs: 300,
        aimSensitivity: 1.5,
        audio: { volume: 0.4, musicOn: true, sfxOn: false },
        cues: { floorArrows: false, targetRings: true, prompts: false },
        reduceMotion: false,
      },
    });
  });

  it('does not mutate its input', () => {
    const input = structuredClone(V3_FIXTURE);
    migrateV3ToV4(input);
    expect(input).toEqual(V3_FIXTURE);
  });

  it('only bumps the version when settings is not an object', () => {
    expect(migrateV3ToV4({ version: 3 })).toEqual({ version: 4 });
    expect(migrateV3ToV4({ version: 3, settings: 'oops' })).toEqual({
      version: 4,
      settings: 'oops',
    });
  });
});

describe('MIGRATIONS', () => {
  it('registers the v1 step', () => {
    expect(MIGRATIONS[1]).toBe(migrateV1ToV2);
  });

  it('registers the v2 step', () => {
    expect(MIGRATIONS[2]).toBe(migrateV2ToV3);
  });

  it('registers the v3 step and targets version 4', () => {
    expect(MIGRATIONS[3]).toBe(migrateV3ToV4);
    expect(CURRENT_VERSION).toBe(4);
  });

  it('chains v1 through v4, ends with music and reduce motion off and valid settings', () => {
    const v1 = {
      ...V1_FIXTURE,
      settings: { ...(V1_FIXTURE.settings as Record<string, unknown>), musicOn: true },
    };
    let doc: Record<string, unknown> = v1;
    for (let v = 1; v < CURRENT_VERSION; v++) doc = MIGRATIONS[v]!(doc);
    expect(doc.version).toBe(4);
    expect((doc.settings as { audio: unknown }).audio).toEqual({
      volume: 0.4,
      musicOn: false,
      sfxOn: true,
    });
    expect((doc.settings as { reduceMotion: unknown }).reduceMotion).toBe(false);
    expect(SECTION_VALIDATORS.settings(doc.settings)).toBeDefined();
  });
});
