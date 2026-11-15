import { describe, expect, it, vi } from 'vitest';
import { loadMasteryTuning } from '../content';
import { createProgressReset } from './progressReset';
import { buildProgressRows, V1_PROGRESS_MODES } from './progressView';
import { createSaveStore, recordRunAttempt } from './storage';
import { createFakeStorage } from './storage/fakeStorage';

const MASTERED = loadMasteryTuning().masteredSuccesses;

function setup() {
  const storage = createFakeStorage();
  const store = createSaveStore({ storage, warn: vi.fn() });
  for (let i = 0; i < MASTERED; i += 1) {
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success: true });
  }
  store.set('seenTooltips', ['x']);
  const reset = createProgressReset({ store });
  return { storage, store, reset };
}

describe('createProgressReset', () => {
  it('request alone and cancel change nothing in the store', () => {
    const { store, reset } = setup();
    const before = JSON.stringify(store.snapshot());
    reset.request();
    expect(reset.pending()).toBe(true);
    expect(JSON.stringify(store.snapshot())).toBe(before);
    reset.cancel();
    expect(reset.pending()).toBe(false);
    expect(reset.message()).toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('request then confirm clears progress and tooltips, keeping settings and bindings', () => {
    const { store, reset } = setup();
    const settings = store.get('settings');
    const bindings = store.get('bindings');
    const listener = vi.fn();
    reset.onChange(listener);
    reset.request();
    reset.confirm();
    expect(store.get('progress')).toEqual({ plays: {} });
    expect(store.get('seenTooltips')).toEqual([]);
    expect(store.get('settings')).toEqual(settings);
    expect(store.get('bindings')).toEqual(bindings);
    expect(reset.pending()).toBe(false);
    expect(reset.message()).toBe('Progress reset.');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('leaves every play and mode at zero and not Mastered', () => {
    const { store, reset } = setup();
    const rows = buildProgressRows(
      ['giveAndGo'],
      V1_PROGRESS_MODES,
      store.get('progress'),
      MASTERED,
    );
    expect(rows[0]?.modes[0]?.mastered).toBe(true);
    reset.request();
    reset.confirm();
    const after = buildProgressRows(
      ['giveAndGo'],
      V1_PROGRESS_MODES,
      store.get('progress'),
      MASTERED,
    );
    for (const row of after) {
      for (const m of row.modes) {
        expect(m).toMatchObject({ attempts: 0, successes: 0, mastered: false });
      }
    }
  });

  it('survives a reopen of the same storage', () => {
    const { storage, reset } = setup();
    reset.request();
    reset.confirm();
    const reopened = createSaveStore({ storage, warn: vi.fn() });
    expect(reopened.get('progress')).toEqual({ plays: {} });
    expect(reopened.get('seenTooltips')).toEqual([]);
  });

  it('confirm without request is a no-op', () => {
    const { store, reset } = setup();
    const before = JSON.stringify(store.snapshot());
    reset.confirm();
    expect(reset.message()).toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('cancel after a confirmed reset clears the status message', () => {
    const { reset } = setup();
    reset.request();
    reset.confirm();
    expect(reset.message()).toBe('Progress reset.');
    reset.cancel();
    expect(reset.message()).toBeNull();
    expect(reset.pending()).toBe(false);
  });

  it('a new request clears the previous message; unsubscribe works', () => {
    const { reset } = setup();
    const listener = vi.fn();
    const off = reset.onChange(listener);
    reset.request();
    reset.confirm();
    reset.request();
    expect(reset.message()).toBeNull();
    off();
    reset.cancel();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
