import { describe, expect, it, vi } from 'vitest';
import * as app from '.';
import { CUE_TOGGLE_LABELS, createDisplaySettings, type MotionOutput } from './displaySettings';
import { createFakeStorage } from './storage/fakeStorage';
import { createSaveStore } from './storage';

function setup(storage = createFakeStorage()) {
  const store = createSaveStore({ storage, warn: vi.fn() });
  const calls: boolean[] = [];
  const output: MotionOutput = { setReduceMotion: (on) => calls.push(on) };
  const display = createDisplaySettings({ store, output });
  return { storage, store, calls, display };
}

describe('createDisplaySettings', () => {
  it('is exported from the app index and labels every cue toggle', () => {
    expect(app.createDisplaySettings).toBe(createDisplaySettings);
    expect(Object.keys(CUE_TOGGLE_LABELS).sort()).toEqual([
      'floorArrows',
      'prompts',
      'targetRings',
    ]);
  });

  it('turning a cue off only sets pending and does not write', () => {
    const { store, display } = setup();
    display.setCueToggle('floorArrows', false);
    expect(display.pending()).toEqual({ kind: 'cueOff', cue: 'floorArrows' });
    expect(store.get('settings').cues.floorArrows).toBe(true);
    expect(display.cues().floorArrows).toBe(true);
  });

  it('confirm writes the cue off and it persists across a reopen', () => {
    const { storage, store, display } = setup();
    display.setCueToggle('targetRings', false);
    display.confirm();
    expect(display.pending()).toBeNull();
    expect(store.get('settings').cues.targetRings).toBe(false);
    const reopened = createSaveStore({ storage, warn: vi.fn() });
    expect(reopened.get('settings').cues).toEqual({
      floorArrows: true,
      targetRings: false,
      prompts: true,
    });
  });

  it('cancel leaves the cue on', () => {
    const { store, display } = setup();
    display.setCueToggle('prompts', false);
    display.cancel();
    expect(display.pending()).toBeNull();
    expect(store.get('settings').cues.prompts).toBe(true);
  });

  it('turning a cue back on writes immediately with no pending state', () => {
    const { store, display } = setup();
    display.setCueToggle('prompts', false);
    display.confirm();
    display.setCueToggle('prompts', true);
    expect(display.pending()).toBeNull();
    expect(store.get('settings').cues.prompts).toBe(true);
  });

  it('turning off a cue that is already off is a no-op', () => {
    const { display } = setup();
    display.setCueToggle('prompts', false);
    display.confirm();
    const listener = vi.fn();
    display.onChange(listener);
    display.setCueToggle('prompts', false);
    expect(display.pending()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores an unknown cue and confirm or cancel with nothing pending', () => {
    const { store, display } = setup();
    const before = store.get('settings');
    const listener = vi.fn();
    display.onChange(listener);
    display.setCueToggle('bogus' as never, false);
    display.confirm();
    display.cancel();
    expect(display.pending()).toBeNull();
    expect(store.get('settings')).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('cue writes leave audio, controls and reduceMotion untouched', () => {
    const { store, display } = setup();
    const before = store.get('settings');
    display.setCueToggle('floorArrows', false);
    display.confirm();
    const after = store.get('settings');
    expect({ ...after, cues: null }).toEqual({ ...before, cues: null });
    expect(after.audio).toEqual(before.audio);
  });

  it('setReduceMotion persists, pushes to the output and notifies', () => {
    const { storage, calls, display } = setup();
    const listener = vi.fn();
    display.onChange(listener);
    display.setReduceMotion(true);
    expect(display.reduceMotion()).toBe(true);
    expect(calls).toEqual([false, true]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createSaveStore({ storage, warn: vi.fn() }).get('settings').reduceMotion).toBe(true);
  });

  it('creation pushes the stored value to the output', () => {
    const first = setup();
    first.display.setReduceMotion(true);
    const second = setup(first.storage);
    expect(second.calls).toEqual([true]);
  });

  it('the unsubscribe function stops notifications', () => {
    const { display } = setup();
    const listener = vi.fn();
    const off = display.onChange(listener);
    display.setReduceMotion(true);
    off();
    display.setReduceMotion(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
