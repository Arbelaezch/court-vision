import { describe, expect, it } from 'vitest';
import type { PressAction } from './actions';
import { DEFAULT_BINDINGS, gamepadAxisCode, gamepadButtonCode } from './bindings';
import { createFakeScheduler } from './fakeScheduler';
import {
  applyRadialDeadZone,
  createGamepadPoller,
  DEFAULT_GAMEPAD_DEAD_ZONE,
  readGamepadState,
  type GamepadLike,
  type GamepadSource,
} from './gamepad';
import { createInputMapper } from './mapper';

interface PadSpec {
  index?: number;
  buttons?: Record<number, { pressed?: boolean; value?: number }>;
  axes?: number[];
  connected?: boolean;
}

function fakePad({
  index = 0,
  buttons = {},
  axes = [0, 0, 0, 0],
  connected = true,
}: PadSpec = {}): GamepadLike {
  return {
    index,
    connected,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons[i]?.pressed ?? false,
      value: buttons[i]?.value ?? 0,
    })),
  };
}

function setup(source?: GamepadSource) {
  const clock = createFakeScheduler();
  const input = createInputMapper({ schedule: clock.schedule, bindings: DEFAULT_BINDINGS });
  const actions: PressAction[] = [];
  input.onAction((a) => actions.push(a));
  const pads: (GamepadLike | null | undefined)[] = [];
  const poller = createGamepadPoller(input, { getGamepads: source ?? (() => pads) });
  return { input, actions, pads, poller };
}

describe('gamepad poller analog', () => {
  it('scales stick deflection past the dead zone', () => {
    const { input, pads, poller } = setup();
    pads.push(fakePad({ axes: [0.8, 0, 0, 0] }));
    poller.poll();
    const { x } = input.moveAxes();
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
    expect(x).toBeCloseTo((0.8 - 0.15) / 0.85, 4);
  });

  it('full diagonal has unit length and stick up is moveUp', () => {
    const { input, pads, poller } = setup();
    pads.push(fakePad({ axes: [0.7071, -0.7071, 0, 0] }));
    poller.poll();
    const { x, y } = input.moveAxes();
    expect(Math.hypot(x, y)).toBeCloseTo(1, 2);
    expect(y).toBeGreaterThan(0);
  });

  it('ignores deflection inside the dead zone', () => {
    const { input, pads, poller } = setup();
    pads.push(fakePad({ axes: [0.1, 0.05, 0, 0] }));
    poller.poll();
    expect(input.moveAxes()).toEqual({ x: 0, y: 0 });
    expect(input.isHeld('moveRight')).toBe(false);
  });
});

describe('gamepad poller buttons', () => {
  it.each<[number, PressAction]>([
    [0, 'chestPass'],
    [1, 'bouncePass'],
    [3, 'lob'],
    [2, 'shoot'],
    [5, 'floater'],
    [9, 'pause'],
  ])('button %i emits %s', (button, action) => {
    const { actions, pads, poller } = setup();
    pads.push(fakePad({ buttons: { [button]: { pressed: true } } }));
    poller.poll();
    expect(actions).toEqual([action]);
  });

  it('emits once while held and again after release and re-press', () => {
    const { actions, pads, poller } = setup();
    pads[0] = fakePad({ buttons: { 0: { pressed: true } } });
    poller.poll();
    poller.poll();
    poller.poll();
    expect(actions).toEqual(['chestPass']);
    pads[0] = fakePad();
    poller.poll();
    pads[0] = fakePad({ buttons: { 0: { pressed: true } } });
    poller.poll();
    expect(actions).toEqual(['chestPass', 'chestPass']);
  });

  it('treats an analog trigger past the threshold as held', () => {
    const { input, pads, poller } = setup();
    pads[0] = fakePad({ buttons: { 7: { pressed: false, value: 0.6 } } });
    poller.poll();
    expect(input.isHeld('sprint')).toBe(true);
    pads[0] = fakePad({ buttons: { 7: { pressed: false, value: 0.3 } } });
    poller.poll();
    expect(input.isHeld('sprint')).toBe(false);
  });
});

describe('gamepad poller release and robustness', () => {
  it('releaseGamepadInputs leaves keyboard state alone', () => {
    const { input, pads, poller } = setup();
    input.press('KeyW');
    pads[0] = fakePad({ buttons: { 7: { pressed: true } }, axes: [0.9, 0, 0, 0] });
    poller.poll();
    expect(input.isHeld('sprint')).toBe(true);
    expect(input.moveAxes().x).toBeGreaterThan(0);
    poller.releaseGamepadInputs();
    expect(input.isHeld('sprint')).toBe(false);
    expect(input.moveAxes().x).toBe(0);
    expect(input.isHeld('moveUp')).toBe(true);
  });

  it('excludeIndex releases that pad', () => {
    const { input, pads, poller } = setup();
    pads[0] = fakePad({ index: 0, buttons: { 7: { pressed: true } }, axes: [0.9, 0, 0, 0] });
    poller.poll();
    expect(input.isHeld('sprint')).toBe(true);
    poller.poll({ excludeIndex: 0 });
    expect(input.isHeld('sprint')).toBe(false);
    expect(input.moveAxes().x).toBe(0);
  });

  it('survives a throwing source, empty entries and disconnected pads', () => {
    const thrower = setup(() => {
      throw new Error('blocked');
    });
    expect(() => thrower.poller.poll()).not.toThrow();

    const empty = setup(() => [null, undefined]);
    expect(() => empty.poller.poll()).not.toThrow();
    expect(empty.input.moveAxes()).toEqual({ x: 0, y: 0 });

    const dead = setup();
    dead.pads.push(
      fakePad({ connected: false, buttons: { 0: { pressed: true } }, axes: [1, 0, 0, 0] }),
    );
    expect(() => dead.poller.poll()).not.toThrow();
    expect(dead.actions).toEqual([]);
    expect(dead.input.moveAxes()).toEqual({ x: 0, y: 0 });
  });

  it.each([1, -0.1, NaN])('rejects deadZone %s', (deadZone) => {
    const input = createInputMapper({ schedule: createFakeScheduler().schedule });
    expect(() => createGamepadPoller(input, { getGamepads: () => [], deadZone })).toThrow(
      /deadZone/,
    );
  });
});

describe('applyRadialDeadZone', () => {
  it('is zero inside and at the edge, and 1 at full deflection', () => {
    expect(applyRadialDeadZone(0.1, 0.05, 0.15)).toEqual({ x: 0, y: 0 });
    expect(applyRadialDeadZone(0.15, 0, 0.15)).toEqual({ x: 0, y: 0 });
    const full = applyRadialDeadZone(1, 0, 0.15);
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(1, 6);
  });
});

describe('readGamepadState', () => {
  const dz = DEFAULT_GAMEPAD_DEAD_ZONE;
  const rescale = (v: number) => (v - dz) / (1 - dz);

  it('unions buttons and keeps the strongest analog value across pads', () => {
    const state = readGamepadState(
      [
        fakePad({ index: 0, buttons: { 0: { pressed: true } }, axes: [0.5, 0, 0, 0] }),
        fakePad({ index: 1, buttons: { 1: { pressed: true } }, axes: [0.9, 0, 0, 0] }),
        fakePad({ index: 2, axes: [0.3, 0, 0, 0] }),
      ],
      dz,
    );
    expect(state.buttons).toEqual(new Set([gamepadButtonCode(0), gamepadButtonCode(1)]));
    expect(state.analog.get(gamepadAxisCode(0, '+'))).toBeCloseTo(rescale(0.9));
  });

  it('reads the right stick radially', () => {
    const state = readGamepadState([fakePad({ axes: [0, 0, 0.8, 0] })], dz);
    expect(state.analog.get(gamepadAxisCode(2, '+'))).toBeCloseTo(rescale(0.8));
    const inside = readGamepadState([fakePad({ axes: [0, 0, 0.1, 0.1] })], dz);
    expect(inside.analog.size).toBe(0);
  });

  it('applies a per-axis dead zone to unpaired axes', () => {
    const state = readGamepadState([fakePad({ axes: [0, 0, 0, 0, -0.6] })], dz);
    expect(state.analog.get(gamepadAxisCode(4, '-'))).toBeCloseTo(rescale(0.6));
    expect(readGamepadState([fakePad({ axes: [0.1] })], dz).analog.size).toBe(0);
    const lone = readGamepadState([fakePad({ axes: [0, 0, 0.7] })], dz);
    expect(lone.analog.get(gamepadAxisCode(2, '+'))).toBeCloseTo(rescale(0.7));
  });

  it('excludeIndex skips only that pad', () => {
    const state = readGamepadState(
      [
        fakePad({ index: 0, buttons: { 0: { pressed: true } } }),
        fakePad({ index: 1, buttons: { 1: { pressed: true } } }),
      ],
      dz,
      0,
    );
    expect(state.buttons).toEqual(new Set([gamepadButtonCode(1)]));
  });
});
