import { describe, expect, it } from 'vitest';
import type { PressAction } from './actions';
import { DEFAULT_BINDINGS, validateBindings, type Binding } from './bindings';
import { createFakeScheduler } from './fakeScheduler';
import { createInputMapper } from './mapper';

function setup() {
  const clock = createFakeScheduler();
  const input = createInputMapper({ schedule: clock.schedule });
  const actions: PressAction[] = [];
  input.onAction((a) => actions.push(a));
  return { input, actions };
}

describe('gamepad default bindings', () => {
  it('validate', () => {
    expect(() => validateBindings(DEFAULT_BINDINGS)).not.toThrow();
  });

  it.each<[string, PressAction]>([
    ['GamepadButton0', 'chestPass'],
    ['GamepadButton1', 'bouncePass'],
    ['GamepadButton3', 'lob'],
    ['GamepadButton2', 'shoot'],
    ['GamepadButton5', 'floater'],
    ['GamepadButton4', 'callForScreen'],
    ['GamepadButton9', 'pause'],
    ['GamepadButton12', 'passTarget1'],
    ['GamepadButton15', 'passTarget2'],
    ['GamepadButton13', 'passTarget3'],
    ['GamepadButton14', 'passTarget4'],
  ])('%s emits %s immediately', (code, action) => {
    const { input, actions } = setup();
    input.press(code);
    expect(actions).toEqual([action]);
  });

  it.each<[string, 'sprint' | 'pivot']>([
    ['GamepadButton7', 'sprint'],
    ['GamepadButton6', 'pivot'],
  ])('%s holds %s', (code, action) => {
    const { input } = setup();
    input.press(code);
    expect(input.isHeld(action)).toBe(true);
    input.release(code);
    expect(input.isHeld(action)).toBe(false);
  });
});

describe('gamepad binding validation', () => {
  it.each(['GamepadButton', 'GamepadButtonX', 'GamepadAxis0', 'GamepadAxis0*', 'Gamepad'])(
    'rejects malformed input %s',
    (input) => {
      expect(() => validateBindings([{ input, action: 'sprint' }])).toThrow(
        /malformed gamepad input/,
      );
    },
  );

  it('rejects an axis bound to a press action', () => {
    const bad: Binding[] = [{ input: 'GamepadAxis0+', action: 'shoot' }];
    expect(() => validateBindings(bad)).toThrow(/binds gamepad axis/);
  });
});

describe('analog input', () => {
  it('gives proportional x and marks the direction held', () => {
    const { input } = setup();
    input.setAnalog('GamepadAxis0+', 0.5);
    const { x, y } = input.moveAxes();
    expect(x).toBeCloseTo(0.5);
    expect(y).toBe(0);
    expect(input.isHeld('moveRight')).toBe(true);
  });

  it('maps axis 1 negative to up', () => {
    const { input } = setup();
    input.setAnalog('GamepadAxis1-', 0.4);
    expect(input.moveAxes().y).toBeCloseTo(0.4);
  });

  it('clamps values and treats NaN as 0', () => {
    const { input } = setup();
    input.setAnalog('GamepadAxis0+', 2);
    expect(input.moveAxes().x).toBe(1);
    input.setAnalog('GamepadAxis0+', NaN);
    expect(input.moveAxes().x).toBe(0);
    expect(input.isHeld('moveRight')).toBe(false);
  });

  it('uses the max of keyboard and analog, not the sum', () => {
    const { input } = setup();
    input.press('KeyD');
    input.setAnalog('GamepadAxis0+', 0.3);
    expect(input.moveAxes().x).toBe(1);
  });

  it('clears with 0 and on releaseAll', () => {
    const { input } = setup();
    input.setAnalog('GamepadAxis0+', 0.5);
    input.setAnalog('GamepadAxis0+', 0);
    expect(input.moveAxes().x).toBe(0);
    input.setAnalog('GamepadAxis0+', 0.5);
    input.releaseAll();
    expect(input.moveAxes().x).toBe(0);
  });

  it('never emits actions', () => {
    const { input, actions } = setup();
    input.setAnalog('GamepadAxis0+', 1);
    input.setAnalog('GamepadAxis1-', 1);
    expect(actions).toEqual([]);
  });

  it('keeps keyboard-only diagonal normalized', () => {
    const { input } = setup();
    input.press('KeyW');
    input.press('KeyD');
    const { x, y } = input.moveAxes();
    expect(x).toBeCloseTo(0.7071, 4);
    expect(y).toBeCloseTo(0.7071, 4);
  });
});
