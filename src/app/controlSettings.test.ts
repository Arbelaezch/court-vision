import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BINDINGS,
  HELD_ACTIONS,
  PRESS_ACTIONS,
  createInputMapper,
  validateBindings,
  type Binding,
  type PressAction,
} from '../input';
import { createFakeScheduler } from '../input/fakeScheduler';
import { CONTROL_ACTIONS, createControlSettings, inputLabel, planRebind } from './controlSettings';
import { createFakeStorage } from './storage/fakeStorage';
import { createSaveStore } from './storage';

function setup(storage = createFakeStorage()) {
  const warn = vi.fn();
  const store = createSaveStore({ storage, warn });
  const clock = createFakeScheduler();
  const mapper = createInputMapper({ schedule: clock.schedule });
  const actions: PressAction[] = [];
  mapper.onAction((a) => actions.push(a));
  const controls = createControlSettings({ store, input: mapper });
  return { storage, store, clock, mapper, actions, controls };
}

const indexOf = (b: readonly Binding[], input: string, action: string, gesture?: string) =>
  b.findIndex((x) => x.input === input && x.action === action && x.gesture === gesture);

describe('createControlSettings rebinding', () => {
  it('AC1: moves shoot to KeyF, applies it, and persists across reload', () => {
    const { storage, store, mapper, actions, controls } = setup();
    controls.beginRebind(indexOf(store.get('bindings'), 'Space', 'shoot'));
    expect(controls.capture().kind).toBe('listening');
    mapper.press('KeyF');
    expect(controls.capture().kind).toBe('idle');
    const b = store.get('bindings');
    expect(b).toContainEqual({ input: 'KeyF', action: 'shoot' });
    expect(b.some((x) => x.input === 'Space')).toBe(false);
    mapper.release('KeyF');
    actions.length = 0;
    mapper.press('KeyF');
    expect(actions).toEqual(['shoot']);
    mapper.release('KeyF');
    mapper.press('Space');
    expect(actions).toEqual(['shoot']);

    const store2 = createSaveStore({ storage, warn: vi.fn() });
    expect(store2.get('bindings')).toContainEqual({ input: 'KeyF', action: 'shoot' });
    const fresh = setup(storage);
    fresh.mapper.press('KeyF');
    expect(fresh.actions).toEqual(['shoot']);
  });

  it('AC2: conflict warns, cancel keeps store, swap exchanges inputs', () => {
    const { store, mapper, controls } = setup();
    const before = store.get('bindings');
    const idx = indexOf(before, 'Space', 'shoot');
    controls.beginRebind(idx);
    mapper.press('KeyE');
    expect(controls.capture().kind).toBe('conflict');
    expect(controls.message()).toContain('Floater');
    expect(store.get('bindings')).toEqual(before);
    controls.cancel();
    expect(store.get('bindings')).toEqual(before);

    controls.beginRebind(idx);
    mapper.press('KeyE');
    controls.confirmSwap();
    const after = store.get('bindings');
    expect(after).toContainEqual({ input: 'KeyE', action: 'shoot' });
    expect(after).toContainEqual({ input: 'Space', action: 'floater' });
    expect(() => validateBindings(after)).not.toThrow();
    const keys = after.map((b) => `${b.input}|${b.gesture ?? 'single'}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('planRebind: same input on the same slot is unchanged', () => {
    const i = indexOf(DEFAULT_BINDINGS, 'Mouse0', 'chestPass');
    expect(planRebind(DEFAULT_BINDINGS, i, 'Mouse0').kind).toBe('unchanged');
  });

  it('capturing Mouse0 for lob KeyR conflicts with chestPass only', () => {
    const plan = planRebind(DEFAULT_BINDINGS, indexOf(DEFAULT_BINDINGS, 'KeyR', 'lob'), 'Mouse0');
    expect(plan.kind).toBe('conflict');
    if (plan.kind === 'conflict') expect(plan.otherAction).toBe('chestPass');
  });

  it('sprint to Mouse0 is invalid (double binding on Mouse0)', () => {
    const plan = planRebind(
      DEFAULT_BINDINGS,
      indexOf(DEFAULT_BINDINGS, 'ShiftLeft', 'sprint'),
      'Mouse0',
    );
    expect(plan.kind).toBe('invalid');
  });

  it('planRebind does not mutate its input', () => {
    const copy = DEFAULT_BINDINGS.map((b) => ({ ...b }));
    planRebind(DEFAULT_BINDINGS, indexOf(DEFAULT_BINDINGS, 'Space', 'shoot'), 'KeyF');
    expect(DEFAULT_BINDINGS).toEqual(copy);
  });

  it('AC3: gamepad slot ignores keyboard and commits a gamepad button', () => {
    const { storage, store, mapper, actions, controls } = setup();
    controls.beginRebind(indexOf(store.get('bindings'), 'GamepadButton2', 'shoot'));
    mapper.press('KeyF');
    expect(controls.capture().kind).toBe('listening');
    mapper.press('GamepadButton11');
    expect(controls.capture().kind).toBe('idle');
    mapper.release('GamepadButton11');
    actions.length = 0;
    mapper.press('GamepadButton11');
    expect(actions).toEqual(['shoot']);
    const store2 = createSaveStore({ storage, warn: vi.fn() });
    expect(store2.get('bindings')).toContainEqual({ input: 'GamepadButton11', action: 'shoot' });
  });

  it('gamepad axes: rejected for press slots, accepted for held slots', () => {
    const { store, mapper, controls } = setup();
    controls.beginRebind(indexOf(store.get('bindings'), 'GamepadButton2', 'shoot'));
    mapper.setAnalog('GamepadAxis2+', 0.9);
    expect(controls.capture().kind).toBe('idle');
    expect(controls.message()).toContain('Sticks');

    controls.beginRebind(indexOf(store.get('bindings'), 'GamepadAxis1-', 'moveUp'));
    mapper.setAnalog('GamepadAxis3-', 0.9);
    expect(store.get('bindings')).toContainEqual({ input: 'GamepadAxis3-', action: 'moveUp' });
  });

  it('Escape cancels without emitting pause or changing bindings', () => {
    const { store, mapper, actions, controls } = setup();
    const before = store.get('bindings');
    controls.beginRebind(indexOf(before, 'Space', 'shoot'));
    mapper.press('Escape');
    expect(controls.capture().kind).toBe('idle');
    expect(controls.message()).toBe('Cancelled.');
    expect(actions).toEqual([]);
    expect(store.get('bindings')).toEqual(before);
  });

  it.each(['Tab', 'Enter'])('%s is reserved and cannot be bound', (key) => {
    const { store, mapper, controls } = setup();
    const before = store.get('bindings');
    controls.beginRebind(indexOf(before, 'Space', 'shoot'));
    mapper.press(key);
    expect(controls.capture().kind).toBe('idle');
    expect(controls.message()).toBe(`${key} is reserved for menu navigation.`);
    expect(store.get('bindings')).toEqual(before);
  });
});

describe('createControlSettings settings', () => {
  it('AC4: persists and clamps settings', () => {
    const { storage, controls } = setup();
    controls.setPassTargeting('aim');
    controls.setDoubleClickWindowMs(400);
    controls.setAimSensitivity(2);
    const s = createSaveStore({ storage, warn: vi.fn() }).get('settings');
    expect(s.passTargeting).toBe('aim');
    expect(s.doubleClickWindowMs).toBe(400);
    expect(s.aimSensitivity).toBe(2);

    controls.setDoubleClickWindowMs(5);
    expect(controls.settings().doubleClickWindowMs).toBe(100);
    controls.setDoubleClickWindowMs(NaN);
    expect(controls.settings().doubleClickWindowMs).toBe(100);
    controls.setAimSensitivity(10);
    expect(controls.settings().aimSensitivity).toBe(4);
  });

  it('applies the double-click window to the mapper', () => {
    const { mapper, actions, clock, controls } = setup();
    controls.setDoubleClickWindowMs(400);
    mapper.press('Mouse0');
    clock.advance(399);
    expect(actions).toEqual([]);
    clock.advance(1);
    expect(actions).toEqual(['chestPass']);
  });

  it('AC4: reset restores controls but keeps audio', () => {
    const { store, mapper, actions, clock, controls } = setup();
    controls.beginRebind(indexOf(store.get('bindings'), 'Space', 'shoot'));
    mapper.press('KeyF');
    controls.setPassTargeting('aim');
    controls.setDoubleClickWindowMs(400);
    controls.setAimSensitivity(2);
    store.set('settings', {
      ...store.get('settings'),
      audio: { ...store.get('settings').audio, volume: 0.5 },
    });
    controls.resetToDefaults();
    expect(store.get('bindings')).toEqual(DEFAULT_BINDINGS);
    const s = store.get('settings');
    expect(s.passTargeting).toBe('both');
    expect(s.doubleClickWindowMs).toBe(220);
    expect(s.aimSensitivity).toBe(1);
    expect(s.audio.volume).toBe(0.5);
    mapper.release('KeyF');
    actions.length = 0;
    mapper.press('Mouse0');
    clock.advance(220);
    expect(actions).toEqual(['chestPass']);
  });
});

describe('labels', () => {
  it('CONTROL_ACTIONS covers every action exactly once', () => {
    const ids = CONTROL_ACTIONS.map((c) => c.action).sort();
    expect(ids).toEqual([...HELD_ACTIONS, ...PRESS_ACTIONS].sort());
  });

  it('inputLabel', () => {
    expect(inputLabel('KeyF')).toBe('F');
    expect(inputLabel('Mouse0', 'double')).toBe('Double Left click');
    expect(inputLabel('GamepadButton0')).toBe('A');
    expect(inputLabel('ArrowUp')).toBe('Up arrow');
    expect(inputLabel('ShiftLeft')).toBe('Left Shift');
    expect(inputLabel('GamepadAxis3-')).toBe('Right stick up');
    expect(inputLabel('GamepadButton40')).toBe('Button 40');
  });
});
