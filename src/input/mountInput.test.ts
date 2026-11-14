import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from './bindings';
import { createFakeScheduler } from './fakeScheduler';
import { mountInput } from './mountInput';
import type { PressAction } from './actions';

function setup(bindings = DEFAULT_BINDINGS) {
  const target = new EventTarget();
  const clock = createFakeScheduler();
  const mounted = mountInput({ target, schedule: clock.schedule, bindings });
  const actions: PressAction[] = [];
  mounted.input.onAction((a) => actions.push(a));
  const fire = (type: string, fields: Record<string, unknown> = {}): Event => {
    const e = Object.assign(new Event(type, { cancelable: true }), fields);
    target.dispatchEvent(e);
    return e;
  };
  return { target, clock, mounted, actions, fire };
}

describe('mountInput', () => {
  it('holds and clears moveUp on keydown/keyup', () => {
    const { mounted, fire } = setup();
    fire('keydown', { code: 'KeyW', repeat: false });
    expect(mounted.input.isHeld('moveUp')).toBe(true);
    fire('keyup', { code: 'KeyW' });
    expect(mounted.input.isHeld('moveUp')).toBe(false);
  });

  it('emits shoot and prevents default for bound keys only', () => {
    const { actions, fire } = setup();
    const space = fire('keydown', { code: 'Space', repeat: false });
    expect(actions).toEqual(['shoot']);
    expect(space.defaultPrevented).toBe(true);
    const z = fire('keydown', { code: 'KeyZ', repeat: false });
    expect(z.defaultPrevented).toBe(false);
  });

  it('ignores auto-repeat keydown', () => {
    const { actions, fire } = setup();
    fire('keydown', { code: 'Space', repeat: false });
    fire('keydown', { code: 'Space', repeat: true });
    expect(actions).toEqual(['shoot']);
  });

  it('ignores keydown with ctrl/meta/alt held and does not prevent default', () => {
    const { actions, mounted, fire } = setup();
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      const e = fire('keydown', { code: 'KeyR', repeat: false, [mod]: true });
      expect(e.defaultPrevented).toBe(false);
    }
    expect(actions).toEqual([]);
    expect(mounted.input.isHeld('moveUp')).toBe(false);
  });

  it('Meta keydown releases held keys', () => {
    const { mounted, fire } = setup();
    fire('keydown', { code: 'KeyD', repeat: false });
    expect(mounted.input.isHeld('moveRight')).toBe(true);
    fire('keydown', { code: 'MetaLeft', repeat: false, metaKey: true });
    expect(mounted.input.isHeld('moveRight')).toBe(false);
  });

  it('single left click emits chestPass after the window', () => {
    const { actions, clock, fire } = setup();
    fire('mousedown', { button: 0 });
    fire('mouseup', { button: 0 });
    clock.advance(220);
    expect(actions).toEqual(['chestPass']);
  });

  it('double left click emits lob only', () => {
    const { actions, clock, fire } = setup();
    fire('mousedown', { button: 0 });
    fire('mouseup', { button: 0 });
    clock.advance(100);
    fire('mousedown', { button: 0 });
    fire('mouseup', { button: 0 });
    clock.advance(1000);
    expect(actions).toEqual(['lob']);
  });

  it('right click emits bouncePass', () => {
    const { actions, fire } = setup();
    fire('mousedown', { button: 2 });
    expect(actions).toEqual(['bouncePass']);
  });

  it('prevents contextmenu only when Mouse2 is bound', () => {
    expect(setup().fire('contextmenu').defaultPrevented).toBe(true);
    const noRight = DEFAULT_BINDINGS.filter((b) => b.input !== 'Mouse2');
    expect(setup(noRight).fire('contextmenu').defaultPrevented).toBe(false);
  });

  it('blur clears held inputs', () => {
    const { mounted, fire } = setup();
    fire('keydown', { code: 'ShiftLeft', repeat: false });
    expect(mounted.input.isHeld('sprint')).toBe(true);
    fire('blur');
    expect(mounted.input.isHeld('sprint')).toBe(false);
  });

  it('pointermove records the pointer without preventing default', () => {
    const { mounted, actions, fire } = setup();
    const e = fire('pointermove', { clientX: 100, clientY: 50 });
    expect(mounted.input.pointer()).toEqual({ x: 100, y: 50 });
    expect(e.defaultPrevented).toBe(false);
    expect(actions).toEqual([]);
  });

  it('pointermove has no effect after unmount', () => {
    const { mounted, fire } = setup();
    mounted.unmount();
    fire('pointermove', { clientX: 100, clientY: 50 });
    expect(mounted.input.pointer()).toBeNull();
  });

  describe('arrow keys on range inputs', () => {
    const slider = { getAttribute: (k: string) => (k === 'type' ? 'range' : null) };
    const button = { getAttribute: (k: string) => (k === 'type' ? 'button' : null) };
    const arrowBindings = [{ action: 'moveLeft' as const, input: 'ArrowLeft' }];

    function keydownOn(s: ReturnType<typeof setup>, t: unknown, code = 'ArrowLeft'): Event {
      const e = new Event('keydown', { cancelable: true });
      Object.defineProperty(e, 'target', { value: t });
      Object.defineProperty(e, 'code', { value: code });
      Object.defineProperty(e, 'repeat', { value: false });
      s.target.dispatchEvent(e);
      return e;
    }

    it('does not prevent default on a range input', () => {
      expect(keydownOn(setup(arrowBindings), slider).defaultPrevented).toBe(false);
    });

    it('still prevents default for a bound key on a non-range target', () => {
      expect(keydownOn(setup(arrowBindings), button).defaultPrevented).toBe(true);
    });

    it('always prevents default while capturing', () => {
      const s = setup(arrowBindings);
      s.mounted.input.startCapture(() => {});
      expect(keydownOn(s, slider).defaultPrevented).toBe(true);
      expect(keydownOn(s, slider, 'KeyZ').defaultPrevented).toBe(true);
    });
  });

  it('unmount stops listening and is safe twice', () => {
    const { mounted, actions, fire } = setup();
    mounted.unmount();
    mounted.unmount();
    fire('keydown', { code: 'Space', repeat: false });
    fire('keydown', { code: 'KeyW', repeat: false });
    expect(actions).toEqual([]);
    expect(mounted.input.isHeld('moveUp')).toBe(false);
  });
});
