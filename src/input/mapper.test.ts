import { describe, expect, it } from 'vitest';
import type { HeldAction, PressAction } from './actions';
import { DEFAULT_BINDINGS, type Binding } from './bindings';
import { createFakeScheduler } from './fakeScheduler';
import { createInputMapper, type InputMapperOptions } from './mapper';

function setup(options: InputMapperOptions = {}) {
  const clock = createFakeScheduler();
  const input = createInputMapper({ schedule: clock.schedule, ...options });
  const actions: PressAction[] = [];
  input.onAction((a) => actions.push(a));
  const click = (code = 'Mouse0') => {
    input.press(code);
    input.release(code);
  };
  return { clock, input, actions, click };
}

describe('default key mapping', () => {
  it.each<[string, HeldAction]>([
    ['KeyW', 'moveUp'],
    ['ArrowUp', 'moveUp'],
    ['KeyS', 'moveDown'],
    ['ArrowDown', 'moveDown'],
    ['KeyA', 'moveLeft'],
    ['ArrowLeft', 'moveLeft'],
    ['KeyD', 'moveRight'],
    ['ArrowRight', 'moveRight'],
    ['ShiftLeft', 'sprint'],
    ['ShiftRight', 'sprint'],
    ['KeyC', 'pivot'],
  ])('%s holds %s', (code, action) => {
    const { input } = setup();
    expect(input.isHeld(action)).toBe(false);
    input.press(code);
    expect(input.isHeld(action)).toBe(true);
    input.release(code);
    expect(input.isHeld(action)).toBe(false);
  });

  it.each<[string, PressAction]>([
    ['Space', 'shoot'],
    ['Escape', 'pause'],
    ['Digit1', 'passTarget1'],
    ['Digit2', 'passTarget2'],
    ['Digit3', 'passTarget3'],
    ['Digit4', 'passTarget4'],
    ['KeyE', 'floater'],
    ['KeyQ', 'callForScreen'],
    ['KeyR', 'lob'],
    ['Mouse2', 'bouncePass'],
  ])('%s emits %s immediately', (code, action) => {
    const { input, actions } = setup();
    input.press(code);
    expect(actions).toEqual([action]);
  });
});

describe('moveAxes', () => {
  it('normalizes diagonals', () => {
    const { input } = setup();
    input.press('KeyW');
    input.press('KeyD');
    const { x, y } = input.moveAxes();
    expect(x).toBeCloseTo(0.7071, 4);
    expect(y).toBeCloseTo(0.7071, 4);
  });

  it('cancels opposite keys', () => {
    const { input } = setup();
    input.press('KeyA');
    input.press('KeyD');
    expect(input.moveAxes().x).toBe(0);
  });

  it('keeps an action held while another bound key is down', () => {
    const { input } = setup();
    input.press('KeyW');
    input.press('ArrowUp');
    input.release('KeyW');
    expect(input.isHeld('moveUp')).toBe(true);
  });
});

describe('double click window', () => {
  it('emits chestPass only after the window for a single click', () => {
    const { clock, input, actions, click } = setup();
    click();
    clock.advance(219);
    expect(actions).toEqual([]);
    expect(input.hasPendingPress()).toBe(true);
    clock.advance(1);
    expect(actions).toEqual(['chestPass']);
    expect(input.hasPendingPress()).toBe(false);
  });

  it('emits only lob for two clicks inside the window', () => {
    const { clock, actions, click } = setup();
    click();
    clock.advance(100);
    click();
    clock.advance(1000);
    expect(actions).toEqual(['lob']);
  });

  it('treats a second click after the window as a new single click', () => {
    const { clock, actions, click } = setup();
    click();
    clock.advance(300);
    click();
    clock.advance(300);
    expect(actions).toEqual(['chestPass', 'chestPass']);
  });

  it('uses the window parameter', () => {
    const a = setup({ doubleClickWindowMs: 500 });
    a.click();
    a.clock.advance(400);
    a.click();
    a.clock.advance(1000);
    expect(a.actions).toEqual(['lob']);

    const b = setup({ doubleClickWindowMs: 500 });
    b.click();
    b.clock.advance(499);
    expect(b.actions).toEqual([]);
    b.clock.advance(1);
    expect(b.actions).toEqual(['chestPass']);
  });

  it('rejects a bad window', () => {
    expect(() => createInputMapper({ doubleClickWindowMs: -1 })).toThrow(/^Court Vision:/);
    expect(() => createInputMapper({ doubleClickWindowMs: Number.NaN })).toThrow(/^Court Vision:/);
  });
});

describe('rebinding as data', () => {
  it('swaps Space and KeyE actions', () => {
    const swapped: Binding[] = DEFAULT_BINDINGS.map((b) =>
      b.input === 'Space'
        ? { ...b, action: 'floater' }
        : b.input === 'KeyE'
          ? { ...b, action: 'shoot' }
          : b,
    );
    const { input, actions } = setup({ bindings: swapped });
    input.press('Space');
    input.press('KeyE');
    expect(actions).toEqual(['floater', 'shoot']);
  });

  it('swaps the Mouse0 single and double actions', () => {
    const swapped: Binding[] = DEFAULT_BINDINGS.map((b) =>
      b.input === 'Mouse0' && b.gesture === 'double'
        ? { ...b, action: 'chestPass' }
        : b.input === 'Mouse0'
          ? { ...b, action: 'lob' }
          : b,
    );
    const single = setup({ bindings: swapped });
    single.click();
    single.clock.advance(220);
    expect(single.actions).toEqual(['lob']);

    const double = setup({ bindings: swapped });
    double.click();
    double.clock.advance(100);
    double.click();
    double.clock.advance(1000);
    expect(double.actions).toEqual(['chestPass']);
  });
});

describe('release and dispose', () => {
  it('releaseAll cancels a pending press and clears held state', () => {
    const { clock, input, actions, click } = setup();
    input.press('ShiftLeft');
    click();
    input.releaseAll();
    expect(input.hasPendingPress()).toBe(false);
    expect(input.isHeld('sprint')).toBe(false);
    clock.advance(1000);
    expect(actions).toEqual([]);
  });

  it('emits nothing after dispose', () => {
    const { clock, input, actions } = setup();
    input.dispose();
    input.press('Space');
    input.press('Mouse0');
    clock.advance(1000);
    expect(actions).toEqual([]);
  });

  it('tracks the pointer without emitting actions', () => {
    const { input, actions } = setup();
    expect(input.pointer()).toBeNull();
    input.setPointer(10, 20);
    expect(input.pointer()).toEqual({ x: 10, y: 20 });
    input.setPointer(Number.NaN, 5);
    input.setPointer(5, Number.POSITIVE_INFINITY);
    expect(input.pointer()).toEqual({ x: 10, y: 20 });
    input.releaseAll();
    expect(input.pointer()).toEqual({ x: 10, y: 20 });
    input.clearPointer();
    expect(input.pointer()).toBeNull();
    expect(actions).toEqual([]);
  });

  it('clears the pointer on dispose and ignores later setPointer', () => {
    const { input } = setup();
    input.setPointer(1, 2);
    input.dispose();
    expect(input.pointer()).toBeNull();
    input.setPointer(3, 4);
    expect(input.pointer()).toBeNull();
  });

  it('stops notifying an unsubscribed listener', () => {
    const { input } = setup();
    const got: PressAction[] = [];
    const off = input.onAction((a) => got.push(a));
    off();
    input.press('Space');
    expect(got).toEqual([]);
  });
});
