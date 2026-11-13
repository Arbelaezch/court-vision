import { describe, expect, it } from 'vitest';
import { createFakeScheduler } from './fakeScheduler';
import { createInputMapper } from './mapper';
import { mountGamepad } from './mountGamepad';
import { mountInput } from './mountInput';
import type { GamepadLike } from './gamepad';
import type { PressAction } from './actions';

function fakePad({
  index = 0,
  buttons = {},
  axes = [0, 0, 0, 0],
}: {
  index?: number;
  buttons?: Record<number, boolean>;
  axes?: number[];
} = {}): GamepadLike {
  return {
    index,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons[i] === true,
      value: buttons[i] === true ? 1 : 0,
    })),
    axes,
  };
}

function setup(getGamepads?: () => GamepadLike[]) {
  const target = new EventTarget();
  const clock = createFakeScheduler();
  const pads: GamepadLike[] = [];
  const mounted = mountInput({
    target,
    schedule: clock.schedule,
    gamepad: { getGamepads: getGamepads ?? (() => pads), requestFrame: null },
  });
  const actions: PressAction[] = [];
  mounted.input.onAction((a) => actions.push(a));
  const fire = (type: string, fields: Record<string, unknown> = {}): Event => {
    const e = Object.assign(new Event(type, { cancelable: true }), fields);
    target.dispatchEvent(e);
    return e;
  };
  return { target, clock, pads, mounted, actions, fire };
}

describe('mountGamepad', () => {
  it('handles connect and disconnect mid-session while keyboard keeps working', () => {
    const { pads, mounted, actions, fire } = setup();
    fire('keydown', { code: 'KeyW', repeat: false });
    const pad = fakePad({ buttons: { 7: true }, axes: [1, 0, 0, 0] });
    pads.push(pad);
    fire('gamepadconnected', { gamepad: pad });
    expect(mounted.input.isHeld('sprint')).toBe(true);
    expect(mounted.input.moveAxes().x).toBeGreaterThan(0);

    pads.length = 0;
    expect(() => fire('gamepaddisconnected', { gamepad: { index: 0 } })).not.toThrow();
    expect(mounted.input.isHeld('sprint')).toBe(false);
    expect(mounted.input.moveAxes().x).toBe(0);
    expect(mounted.input.isHeld('moveUp')).toBe(true);

    fire('keydown', { code: 'Space', repeat: false });
    expect(actions).toEqual(['shoot']);
  });

  it('releases a disconnected pad even if it is still listed', () => {
    const { pads, mounted, fire } = setup();
    pads.push(fakePad({ buttons: { 7: true }, axes: [1, 0, 0, 0] }));
    mounted.gamepad!.poll();
    expect(mounted.input.isHeld('sprint')).toBe(true);
    fire('gamepaddisconnected', { gamepad: { index: 0 } });
    expect(mounted.input.isHeld('sprint')).toBe(false);
    expect(mounted.input.moveAxes().x).toBe(0);
  });

  it('ignores malformed connect and disconnect events', () => {
    const { fire } = setup();
    expect(() => {
      fire('gamepadconnected');
      fire('gamepadconnected', { gamepad: null });
      fire('gamepaddisconnected');
      fire('gamepaddisconnected', { gamepad: 'x' });
      fire('gamepaddisconnected', { gamepad: { index: 'a' } });
    }).not.toThrow();
  });

  it('survives a throwing getGamepads', () => {
    const { mounted, fire } = setup(() => {
      throw new Error('blocked');
    });
    expect(() => {
      fire('gamepadconnected', { gamepad: fakePad() });
      mounted.gamepad!.poll();
    }).not.toThrow();
  });

  it('drives polling from requestFrame and cancels on unmount', () => {
    const target = new EventTarget();
    const pads = [fakePad({ buttons: { 0: true } })];
    const queue: (() => void)[] = [];
    let cancelled = 0;
    const requestFrame = (cb: () => void) => {
      queue.push(cb);
      return () => {
        cancelled++;
      };
    };
    const mounted = mountInput({
      target,
      schedule: createFakeScheduler().schedule,
      gamepad: { getGamepads: () => pads, requestFrame },
    });
    const actions: PressAction[] = [];
    mounted.input.onAction((a) => actions.push(a));
    expect(queue).toHaveLength(1);
    queue.shift()!();
    expect(actions).toEqual(['chestPass']);
    expect(queue).toHaveLength(1);

    const pending = queue.shift()!;
    mounted.unmount();
    expect(cancelled).toBe(1);
    pending();
    expect(queue).toHaveLength(0);
  });

  it('stops polling after unmount and unmount is idempotent', () => {
    const { pads, mounted, actions, fire } = setup();
    mounted.unmount();
    pads.push(fakePad({ buttons: { 0: true } }));
    fire('gamepadconnected', { gamepad: pads[0] });
    expect(actions).toEqual([]);
    expect(() => {
      mounted.unmount();
      mounted.gamepad!.unmount();
    }).not.toThrow();
  });

  it('presses buttons on connect without a manual poll', () => {
    const { pads, actions, fire } = setup();
    pads.push(fakePad({ buttons: { 0: true } }));
    fire('gamepadconnected', { gamepad: pads[0] });
    expect(actions).toEqual(['chestPass']);
  });

  it('does not re-press inputs on a live mapper after unmount', () => {
    const input = createInputMapper({ schedule: createFakeScheduler().schedule });
    const pads = [fakePad({ buttons: { 7: true }, axes: [1, 0, 0, 0] })];
    const queue: (() => void)[] = [];
    const gp = mountGamepad(input, {
      target: new EventTarget(),
      getGamepads: () => pads,
      requestFrame: (cb) => {
        queue.push(cb);
        return () => {};
      },
    });
    queue.shift()!();
    expect(input.isHeld('sprint')).toBe(true);
    const stale = queue.shift()!;
    gp.unmount();
    expect(input.isHeld('sprint')).toBe(false);
    stale();
    gp.poll();
    expect(input.isHeld('sprint')).toBe(false);
    expect(input.moveAxes().x).toBe(0);
    expect(queue).toHaveLength(0);
  });

  it('leaves nothing stuck when a listener unmounts during a poll', () => {
    const input = createInputMapper({ schedule: createFakeScheduler().schedule });
    const pads = [fakePad({ buttons: { 0: true, 7: true }, axes: [1, 0, 0, 0] })];
    const gp = mountGamepad(input, {
      target: new EventTarget(),
      getGamepads: () => pads,
      requestFrame: null,
    });
    input.onAction(() => gp.unmount());
    gp.poll();
    expect(input.isHeld('sprint')).toBe(false);
    expect(input.moveAxes().x).toBe(0);
  });

  it('gives gamepad null when disabled and keyboard still works', () => {
    const target = new EventTarget();
    const mounted = mountInput({
      target,
      schedule: createFakeScheduler().schedule,
      gamepad: false,
    });
    expect(mounted.gamepad).toBeNull();
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false }));
    expect(mounted.input.isHeld('moveUp')).toBe(true);
  });

  it('mounts a working gamepad by default under Node', () => {
    const mounted = mountInput({ target: new EventTarget() });
    expect(mounted.gamepad).not.toBeNull();
    expect(() => mounted.gamepad!.poll()).not.toThrow();
    mounted.unmount();
  });
});
