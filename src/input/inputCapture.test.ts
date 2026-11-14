import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, isGamepadAxisInput, isGamepadInput, type Binding } from './bindings';
import { createFakeScheduler } from './fakeScheduler';
import { createInputMapper } from './mapper';
import { mountInput } from './mountInput';
import type { PressAction } from './actions';

function mapperSetup() {
  const clock = createFakeScheduler();
  const mapper = createInputMapper({ schedule: clock.schedule });
  const actions: PressAction[] = [];
  mapper.onAction((a) => actions.push(a));
  return { clock, mapper, actions };
}

const movedShoot: Binding[] = [
  ...DEFAULT_BINDINGS.filter((b) => !(b.input === 'Space' && b.action === 'shoot')),
  { input: 'KeyF', action: 'shoot' },
];

describe('InputMapper.configure', () => {
  it('moves shoot to KeyF', () => {
    const { mapper, actions } = mapperSetup();
    mapper.configure({ bindings: movedShoot });
    mapper.press('KeyF');
    expect(actions).toEqual(['shoot']);
    mapper.press('Space');
    expect(actions).toEqual(['shoot']);
  });

  it('applies a new double-click window', () => {
    const { mapper, actions, clock } = mapperSetup();
    mapper.configure({ doubleClickWindowMs: 400 });
    mapper.press('Mouse0');
    clock.advance(220);
    expect(actions).toEqual([]);
    clock.advance(180);
    expect(actions).toEqual(['chestPass']);
    expect(mapper.config().doubleClickWindowMs).toBe(400);
  });

  it('throws on invalid bindings and keeps the old ones', () => {
    const { mapper, actions } = mapperSetup();
    const bad: Binding[] = [
      { input: 'Space', action: 'shoot' },
      { input: 'Space', action: 'floater' },
    ];
    expect(() => mapper.configure({ bindings: bad, doubleClickWindowMs: 500 })).toThrow();
    expect(mapper.config().doubleClickWindowMs).toBe(220);
    mapper.press('Space');
    expect(actions).toEqual(['shoot']);
  });

  it('cancels a pending single click', () => {
    const { mapper, actions, clock } = mapperSetup();
    mapper.press('Mouse0');
    expect(mapper.hasPendingPress()).toBe(true);
    mapper.configure({ doubleClickWindowMs: 300 });
    expect(mapper.hasPendingPress()).toBe(false);
    clock.advance(1000);
    expect(actions).toEqual([]);
  });

  it('copies the bindings it is given', () => {
    const { mapper } = mapperSetup();
    const list = movedShoot.map((b) => ({ ...b }));
    mapper.configure({ bindings: list });
    list.length = 0;
    expect(mapper.config().bindings.length).toBe(movedShoot.length);
  });
});

describe('InputMapper capture', () => {
  it('routes Escape to the listener without pausing', () => {
    const { mapper, actions } = mapperSetup();
    const listener = vi.fn();
    mapper.startCapture(listener);
    expect(mapper.isCapturing()).toBe(true);
    mapper.press('Escape');
    expect(listener).toHaveBeenCalledWith('Escape');
    expect(actions).toEqual([]);
  });

  it('emits nothing and schedules nothing for Mouse0', () => {
    const { mapper, actions, clock } = mapperSetup();
    mapper.startCapture(vi.fn());
    mapper.press('Mouse0');
    expect(mapper.hasPendingPress()).toBe(false);
    clock.advance(1000);
    expect(actions).toEqual([]);
  });

  it('cancels a pending click when capture starts', () => {
    const { mapper, actions, clock } = mapperSetup();
    mapper.press('Mouse0');
    mapper.startCapture(vi.fn());
    expect(mapper.hasPendingPress()).toBe(false);
    clock.advance(1000);
    expect(actions).toEqual([]);
  });

  it('captures a gamepad axis crossing the threshold once', () => {
    const { mapper } = mapperSetup();
    const listener = vi.fn();
    mapper.startCapture(listener);
    mapper.setAnalog('GamepadAxis1-', 0.3);
    expect(listener).not.toHaveBeenCalled();
    mapper.setAnalog('GamepadAxis1-', 0.8);
    mapper.setAnalog('GamepadAxis1-', 0.9);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('GamepadAxis1-');
  });

  it('emits actions again after stop', () => {
    const { mapper, actions } = mapperSetup();
    const stop = mapper.startCapture(vi.fn());
    stop();
    expect(mapper.isCapturing()).toBe(false);
    mapper.press('Space');
    expect(actions).toEqual(['shoot']);
  });

  it('a second capture replaces the first and the first stop is inert', () => {
    const { mapper } = mapperSetup();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = mapper.startCapture(first);
    mapper.startCapture(second);
    mapper.press('KeyQ');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('KeyQ');
    stopFirst();
    expect(mapper.isCapturing()).toBe(true);
  });
});

describe('input code helpers', () => {
  it('classifies gamepad inputs', () => {
    expect(isGamepadInput('GamepadButton0')).toBe(true);
    expect(isGamepadInput('KeyA')).toBe(false);
    expect(isGamepadAxisInput('GamepadAxis1-')).toBe(true);
    expect(isGamepadAxisInput('GamepadButton1')).toBe(false);
  });
});

describe('mountInput with a live mapper', () => {
  function setup() {
    const target = new EventTarget();
    const mounted = mountInput({ target, gamepad: false });
    const fire = (type: string, fields: Record<string, unknown> = {}): Event => {
      const e = Object.assign(new Event(type, { cancelable: true }), fields);
      target.dispatchEvent(e);
      return e;
    };
    return { mounted, fire };
  }

  it('prevents default for any key while capturing only', () => {
    const { mounted, fire } = setup();
    expect(fire('keydown', { code: 'KeyZ', repeat: false }).defaultPrevented).toBe(false);
    fire('keyup', { code: 'KeyZ' });
    const stop = mounted.input.startCapture(vi.fn());
    expect(fire('keydown', { code: 'KeyZ', repeat: false }).defaultPrevented).toBe(true);
    stop();
    fire('keyup', { code: 'KeyZ' });
    expect(fire('keydown', { code: 'KeyZ', repeat: false }).defaultPrevented).toBe(false);
  });

  it('follows the mapper bindings after configure', () => {
    const { mounted, fire } = setup();
    mounted.input.configure({ bindings: movedShoot });
    expect(fire('keydown', { code: 'KeyF', repeat: false }).defaultPrevented).toBe(true);
    expect(fire('keydown', { code: 'Space', repeat: false }).defaultPrevented).toBe(false);
  });
});
