import { describe, expect, it } from 'vitest';
import { createFakeStorage, type FakeStorage } from './fakeStorage';
import { isMastered, modeProgressFor, recordRunAttempt } from './progress';
import { createSaveStore } from './store';

function setup(): { fake: FakeStorage; warnings: string[] } {
  return { fake: createFakeStorage({}), warnings: [] };
}

function open(fake: FakeStorage, warnings: string[]) {
  return createSaveStore({ storage: fake, warn: (m) => warnings.push(m) });
}

describe('recordRunAttempt', () => {
  it('counts a success as an attempt and a success', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    const next = recordRunAttempt(store, {
      playId: 'giveAndGo',
      modeId: 'practice',
      success: true,
    });
    expect(next).toEqual({ attempts: 1, successes: 1 });
    expect(store.get('progress').plays.giveAndGo?.practice).toEqual({ attempts: 1, successes: 1 });
  });

  it('counts a failure as an attempt only', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    const next = recordRunAttempt(store, {
      playId: 'giveAndGo',
      modeId: 'practice',
      success: false,
    });
    expect(next).toEqual({ attempts: 1, successes: 0 });
  });

  it('accumulates over repeated calls', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    const rec = (success: boolean) =>
      recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success });
    rec(true);
    rec(false);
    expect(rec(true)).toEqual({ attempts: 3, successes: 2 });
  });

  it('leaves other plays and modes untouched', () => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    recordRunAttempt(store, { playId: 'pickAndRoll', modeId: 'practice', success: true });
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'scrimmage', success: false });
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success: true });
    expect(store.get('progress')).toEqual({
      plays: {
        pickAndRoll: { practice: { attempts: 1, successes: 1 } },
        giveAndGo: {
          scrimmage: { attempts: 1, successes: 0 },
          practice: { attempts: 1, successes: 1 },
        },
      },
    });
  });

  it('persists across a new store without warnings', () => {
    const { fake, warnings } = setup();
    recordRunAttempt(open(fake, warnings), {
      playId: 'giveAndGo',
      modeId: 'practice',
      success: true,
    });
    const reopened = open(fake, warnings);
    expect(reopened.get('progress').plays.giveAndGo?.practice).toEqual({
      attempts: 1,
      successes: 1,
    });
    expect(warnings).toEqual([]);
  });

  it('persists a non-standard mode id across a reload', () => {
    const { fake, warnings } = setup();
    recordRunAttempt(open(fake, warnings), {
      playId: 'giveAndGo',
      modeId: 'livePlay',
      success: false,
    });
    const reopened = open(fake, warnings);
    expect(reopened.get('progress').plays.giveAndGo?.livePlay).toEqual({
      attempts: 1,
      successes: 0,
    });
    expect(warnings).toEqual([]);
  });

  it.each([
    ['giveAndGo', 'constructor'],
    ['giveAndGo', 'toString'],
    ['constructor', 'practice'],
    ['toString', 'constructor'],
  ])('treats inherited names as absent for play "%s" mode "%s"', (playId, modeId) => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success: true });
    expect(recordRunAttempt(store, { playId, modeId, success: true })).toEqual({
      attempts: 1,
      successes: 1,
    });
    const reopened = open(fake, warnings);
    expect(
      Object.getOwnPropertyDescriptor(reopened.get('progress').plays[playId] ?? {}, modeId)?.value,
    ).toEqual({
      attempts: 1,
      successes: 1,
    });
    expect(reopened.get('progress').plays.giveAndGo?.practice).toEqual({
      attempts: 1,
      successes: 1,
    });
    expect(warnings).toEqual([]);
  });

  it.each([
    ['bad id', 'practice'],
    ['giveAndGo', '__proto__'],
  ])('throws for play "%s" with mode "%s" and leaves progress unchanged', (playId, modeId) => {
    const { fake, warnings } = setup();
    const store = open(fake, warnings);
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success: true });
    const before = structuredClone(store.get('progress'));
    expect(() => recordRunAttempt(store, { playId, modeId, success: true })).toThrow(
      /Court Vision:/,
    );
    expect(store.get('progress')).toEqual(before);
  });
});

describe('modeProgressFor', () => {
  const progress = { plays: { giveAndGo: { practice: { attempts: 4, successes: 2 } } } };

  it.each([
    ['missing play', 'nope', 'practice'],
    ['missing mode', 'giveAndGo', 'scrimmage'],
    ['inherited play', 'constructor', 'practice'],
    ['inherited mode', 'giveAndGo', 'toString'],
  ])('returns zeros for %s', (_l, playId, modeId) => {
    expect(modeProgressFor(progress, playId, modeId)).toEqual({ attempts: 0, successes: 0 });
  });

  it('returns stored counts', () => {
    expect(modeProgressFor(progress, 'giveAndGo', 'practice')).toEqual({
      attempts: 4,
      successes: 2,
    });
  });
});

describe('isMastered', () => {
  it('is false below and true at the threshold', () => {
    expect(isMastered({ attempts: 20, successes: 9 }, 10)).toBe(false);
    expect(isMastered({ attempts: 20, successes: 10 }, 10)).toBe(true);
  });
});
