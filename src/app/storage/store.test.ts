import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS } from '../../input';
import * as app from '..';
import { createFakeStorage, type FakeStorage } from './fakeStorage';
import { defaultSaveDocument, type SaveDocument, type SettingsSection } from './schema';
import { SAVE_STORAGE_KEY, createSaveStore } from './store';

const V1_FIXTURE = {
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

const CUSTOM_SETTINGS: SettingsSection = {
  passTargeting: 'numbered',
  doubleClickWindowMs: 250,
  aimSensitivity: 0.8,
  audio: { volume: 0.5, musicOn: false, sfxOn: true },
  cues: { floorArrows: true, targetRings: false, prompts: true },
};

const CUSTOM_BINDINGS = [
  ...DEFAULT_BINDINGS.filter((b) => b.input !== 'Space'),
  { input: 'KeyF', action: 'shoot' as const },
];

const V2_FIXTURE: SaveDocument = {
  version: 2,
  progress: {
    plays: { 'give-and-go': { practice: { attempts: 3, successes: 2 } }, 'pick-and-roll': {} },
  },
  settings: CUSTOM_SETTINGS,
  bindings: CUSTOM_BINDINGS,
  seenTooltips: ['sprint', 'pass'],
};

function setup(blob?: string): { fake: FakeStorage; warnings: string[] } {
  const fake = createFakeStorage(blob === undefined ? {} : { [SAVE_STORAGE_KEY]: blob });
  return { fake, warnings: [] };
}

function open(fake: FakeStorage, warnings: string[]) {
  return createSaveStore({ storage: fake, warn: (m) => warnings.push(m) });
}

function stored(fake: FakeStorage): Record<string, unknown> {
  return JSON.parse(fake.data.get(SAVE_STORAGE_KEY) ?? 'null') as Record<string, unknown>;
}

describe('createSaveStore load', () => {
  it('uses defaults for empty storage without warning or writing', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    expect(store.snapshot()).toEqual(defaultSaveDocument());
    expect(warnings).toEqual([]);
    expect(fake.data.size).toBe(0);
  });

  it('keeps a valid v2 document as is without warning or rewriting', () => {
    const blob = JSON.stringify(V2_FIXTURE);
    const { fake, warnings } = setup(blob);
    const store = open(fake, warnings);
    expect(store.snapshot()).toEqual(V2_FIXTURE);
    expect(warnings).toEqual([]);
    expect(fake.data.get(SAVE_STORAGE_KEY)).toBe(blob);
  });

  it('uses defaults with one warning when the blob is not JSON', () => {
    const { fake, warnings } = setup('{not json');
    const store = open(fake, warnings);
    expect(store.snapshot()).toEqual(defaultSaveDocument());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved data is corrupt/);
  });

  const CORRUPT_BLOBS = ['[]', '42', 'null', '{"version":0}', '{"version":"2"}', '{}'];
  it.each(CORRUPT_BLOBS)('treats %s as corrupt', (blob) => {
    const { fake, warnings } = setup(blob);
    expect(open(fake, warnings).snapshot()).toEqual(defaultSaveDocument());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved data is corrupt/);
  });

  it('uses defaults with a warning for a version newer than current', () => {
    const { fake, warnings } = setup(JSON.stringify({ ...V2_FIXTURE, version: 99 }));
    const store = open(fake, warnings);
    expect(store.snapshot()).toEqual(defaultSaveDocument());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: .*version 99/);
  });

  it('never overwrites a newer-version save, even after set() and reset()', () => {
    const blob = JSON.stringify({ ...V2_FIXTURE, version: 99 });
    const { fake, warnings } = setup(blob);
    const store = open(fake, warnings);
    store.set('settings', CUSTOM_SETTINGS);
    expect(store.get('settings')).toEqual(CUSTOM_SETTINGS);
    store.resetProgress();
    store.reset('bindings');
    expect(fake.data.get(SAVE_STORAGE_KEY)).toBe(blob);
  });

  it('warns through console.warn by default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fake = createFakeStorage({ [SAVE_STORAGE_KEY]: '{not json' });
      createSaveStore({ storage: fake });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toMatch(/saved data is corrupt/);
    } finally {
      spy.mockRestore();
    }
  });

  it('resets only an invalid settings section and rewrites the blob', () => {
    const { fake, warnings } = setup(JSON.stringify({ ...V2_FIXTURE, settings: 'oops' }));
    const store = open(fake, warnings);
    expect(store.get('settings')).toEqual(defaultSaveDocument().settings);
    expect(store.get('progress')).toEqual(V2_FIXTURE.progress);
    expect(store.get('bindings')).toEqual(V2_FIXTURE.bindings);
    expect(store.get('seenTooltips')).toEqual(V2_FIXTURE.seenTooltips);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved section "settings" is invalid/);
    expect(stored(fake)).toEqual({ ...V2_FIXTURE, settings: defaultSaveDocument().settings });
  });

  it('resets only bindings with an unknown action and rewrites the blob', () => {
    const bad = { ...V2_FIXTURE, bindings: [{ input: 'KeyW', action: 'notAnAction' }] };
    const { fake, warnings } = setup(JSON.stringify(bad));
    const store = open(fake, warnings);
    expect(store.get('bindings')).toEqual(DEFAULT_BINDINGS);
    expect(store.get('progress')).toEqual(V2_FIXTURE.progress);
    expect(store.get('settings')).toEqual(V2_FIXTURE.settings);
    expect(store.get('seenTooltips')).toEqual(V2_FIXTURE.seenTooltips);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved section "bindings" is invalid/);
    expect(stored(fake)).toEqual({ ...V2_FIXTURE, bindings: DEFAULT_BINDINGS });
  });

  it('resets a missing section and drops unknown keys and fields', () => {
    const { seenTooltips: _omit, ...rest } = V2_FIXTURE;
    void _omit;
    const doc = {
      ...rest,
      extra: true,
      settings: { ...CUSTOM_SETTINGS, legacy: 1 },
    };
    const { fake, warnings } = setup(JSON.stringify(doc));
    const store = open(fake, warnings);
    expect(store.snapshot()).toEqual({ ...V2_FIXTURE, seenTooltips: [] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved section "seenTooltips" is invalid/);
    expect(stored(fake)).toEqual({ ...V2_FIXTURE, seenTooltips: [] });
  });

  const BAD_PROGRESS: [string, unknown][] = [
    ['negative attempts', { plays: { p: { practice: { attempts: -1, successes: 0 } } } }],
    ['fractional successes', { plays: { p: { scrimmage: { attempts: 2, successes: 1.5 } } } }],
    ['unknown mode', { plays: { p: { freePlay: { attempts: 1, successes: 1 } } } }],
    ['plays not an object', { plays: [] }],
  ];
  it.each(BAD_PROGRESS)('resets progress with %s', (_label, progress) => {
    const { fake, warnings } = setup(JSON.stringify({ ...V2_FIXTURE, progress }));
    const store = open(fake, warnings);
    expect(store.get('progress')).toEqual({ plays: {} });
    expect(store.get('settings')).toEqual(CUSTOM_SETTINGS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: saved section "progress" is invalid/);
  });

  const BAD_SETTINGS: [string, unknown][] = [
    ['volume above 1', { ...CUSTOM_SETTINGS, audio: { ...CUSTOM_SETTINGS.audio, volume: 1.2 } }],
    ['zero double-click window', { ...CUSTOM_SETTINGS, doubleClickWindowMs: 0 }],
    ['unknown targeting', { ...CUSTOM_SETTINGS, passTargeting: 'mind' }],
    ['non-boolean cue', { ...CUSTOM_SETTINGS, cues: { ...CUSTOM_SETTINGS.cues, prompts: 1 } }],
  ];
  it.each(BAD_SETTINGS)('resets settings with %s', (_label, settings) => {
    const { fake, warnings } = setup(JSON.stringify({ ...V2_FIXTURE, settings }));
    expect(open(fake, warnings).get('settings')).toEqual(defaultSaveDocument().settings);
    expect(warnings).toHaveLength(1);
  });

  it('deduplicates seen tooltips and rejects empty ids', () => {
    const dup = setup(JSON.stringify({ ...V2_FIXTURE, seenTooltips: ['a', 'b', 'a'] }));
    expect(open(dup.fake, dup.warnings).get('seenTooltips')).toEqual(['a', 'b']);
    expect(dup.warnings).toEqual([]);
    const empty = setup(JSON.stringify({ ...V2_FIXTURE, seenTooltips: ['a', ''] }));
    expect(open(empty.fake, empty.warnings).get('seenTooltips')).toEqual([]);
    expect(empty.warnings).toHaveLength(1);
  });

  it('migrates a v1 document to v2 and rewrites the stored blob', () => {
    const { fake, warnings } = setup(JSON.stringify(V1_FIXTURE));
    const store = open(fake, warnings);
    expect(store.get('settings')).toEqual({
      passTargeting: 'aim',
      doubleClickWindowMs: 300,
      aimSensitivity: 1.5,
      audio: { volume: 0.4, musicOn: false, sfxOn: true },
      cues: { floorArrows: false, targetRings: false, prompts: false },
    });
    expect(store.get('progress')).toEqual(V1_FIXTURE.progress);
    expect(store.get('seenTooltips')).toEqual(['sprint']);
    expect(store.snapshot().version).toBe(2);
    expect(stored(fake).version).toBe(2);
    expect(stored(fake)).toEqual(store.snapshot());
    expect(warnings).toEqual([]);
  });

  it('does not throw when the storage getter fails', () => {
    const warnings: string[] = [];
    const store = createSaveStore({
      storage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {},
      },
      warn: (m) => warnings.push(m),
    });
    expect(store.snapshot()).toEqual(defaultSaveDocument());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: storage unavailable/);
  });
});

describe('createSaveStore writes', () => {
  it('persists set() and keeps the value in memory when setItem throws', () => {
    const { fake, warnings } = setup();
    fake.throwOnSet = true;
    const store = open(fake, warnings);
    expect(() => store.set('seenTooltips', ['pass'])).not.toThrow();
    expect(store.get('seenTooltips')).toEqual(['pass']);
    expect(() => store.set('settings', CUSTOM_SETTINGS)).not.toThrow();
    expect(store.get('settings')).toEqual(CUSTOM_SETTINGS);
    expect(fake.data.size).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it('persists set() to storage', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    store.set('settings', CUSTOM_SETTINGS);
    expect(stored(fake)).toEqual({ ...defaultSaveDocument(), settings: CUSTOM_SETTINGS });
    expect(open(fake, warnings).get('settings')).toEqual(CUSTOM_SETTINGS);
    expect(warnings).toEqual([]);
  });

  it('resetProgress() clears progress and seen tooltips only', () => {
    const { fake, warnings } = setup(JSON.stringify(V2_FIXTURE));
    const store = open(fake, warnings);
    store.resetProgress();
    expect(store.snapshot()).toEqual({
      ...V2_FIXTURE,
      progress: { plays: {} },
      seenTooltips: [],
    });
    expect(stored(fake)).toEqual(store.snapshot());
  });

  it("reset('bindings') restores the default bindings", () => {
    const { fake, warnings } = setup(JSON.stringify(V2_FIXTURE));
    const store = open(fake, warnings);
    store.reset('bindings');
    expect(store.get('bindings')).toEqual(DEFAULT_BINDINGS);
    expect(store.get('settings')).toEqual(CUSTOM_SETTINGS);
    expect(stored(fake).bindings).toEqual(DEFAULT_BINDINGS);
  });

  it('is exported from the app barrel', () => {
    expect(app.createSaveStore).toBe(createSaveStore);
    expect(app.CURRENT_VERSION).toBe(2);
  });

  it('uses a custom key', () => {
    const fake = createFakeStorage();
    const store = createSaveStore({ storage: fake, key: 'other', warn: () => {} });
    store.set('seenTooltips', ['x']);
    expect(fake.data.has('other')).toBe(true);
    expect(fake.data.has(SAVE_STORAGE_KEY)).toBe(false);
  });
});
