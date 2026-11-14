import { describe, expect, it, vi } from 'vitest';
import { CONTROL_ACTIONS, type CaptureState, type ControlSettings } from '../app';
import { DEFAULT_BINDINGS } from '../input';
import { createControlsView } from './controlsView';

type Handler = (e?: unknown) => void;

class FakeEl {
  tagName: string;
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  className = '';
  textContent = '';
  value = '';
  removed = false;
  private listeners: Record<string, { fn: Handler; capture: boolean }[]> = {};
  constructor(tag = 'div') {
    this.tagName = tag;
  }
  appendChild(c: FakeEl): FakeEl {
    this.children.push(c);
    return c;
  }
  removeChild(c: FakeEl): void {
    this.children = this.children.filter((x) => x !== c);
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  addEventListener(type: string, fn: Handler, capture: boolean | undefined = false): void {
    (this.listeners[type] ??= []).push({ fn, capture });
  }
  dispatch(type: string, event?: unknown): void {
    const all = this.listeners[type] ?? [];
    for (const l of all.filter((x) => x.capture)) l.fn(event);
    for (const l of all.filter((x) => !x.capture)) l.fn(event);
  }
  click(): void {
    this.dispatch('click');
  }
  replaceChildren(): void {
    this.children = [];
  }
  remove(): void {
    this.removed = true;
  }
  focused = 0;
  focus(): void {
    this.focused += 1;
  }
  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null;
  }
}

function all(el: FakeEl, pred: (n: FakeEl) => boolean): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (n: FakeEl): void => {
    if (pred(n)) out.push(n);
    n.children.forEach(walk);
  };
  walk(el);
  return out;
}

function setup() {
  const state = {
    capture: { kind: 'idle' } as CaptureState,
    message: null as string | null,
    passTargeting: 'both' as 'numbered' | 'aim' | 'both',
  };
  let listener: (() => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const controls = {
    bindings: () => DEFAULT_BINDINGS.map((b) => ({ ...b })),
    settings: () => ({
      passTargeting: state.passTargeting,
      doubleClickWindowMs: 220,
      aimSensitivity: 1,
    }),
    capture: () => state.capture,
    message: () => state.message,
    beginRebind: vi.fn(),
    confirmSwap: vi.fn(),
    cancel: vi.fn(),
    setPassTargeting: vi.fn(),
    setDoubleClickWindowMs: vi.fn(),
    setAimSensitivity: vi.fn(),
    resetToDefaults: vi.fn(),
    onChange: (l: () => void) => {
      listener = l;
      return unsubscribe;
    },
    dispose: vi.fn(),
  };
  const doc = {
    activeElement: null as FakeEl | null,
    createElement: (tag: string) => new FakeEl(tag),
  };
  const view = createControlsView({
    doc: doc as unknown as Document,
    controls: controls as unknown as ControlSettings,
  });
  const parent = new FakeEl();
  const cleanup = view.mount(parent as unknown as HTMLElement);
  const root = parent.children[0]!;
  return {
    state,
    doc,
    controls,
    parent,
    root,
    cleanup,
    unsubscribe,
    fire: () => listener?.(),
  };
}

const rows = (root: FakeEl): FakeEl[] =>
  all(root, (n) => n.tagName === 'tr').filter(
    (tr) => tr.children[0]!.tagName === 'th' && tr.children[0]!.attrs['scope'] === 'row',
  );

describe('createControlsView', () => {
  it('renders one row per action with Shoot on Space and X', () => {
    const { root } = setup();
    const rs = rows(root);
    expect(rs).toHaveLength(CONTROL_ACTIONS.length);
    const shoot = rs.find((r) => r.children[0]!.textContent === 'Shoot')!;
    expect(shoot.children[1]!.children.map((b) => b.textContent)).toEqual(['Space']);
    expect(shoot.children[2]!.children.map((b) => b.textContent)).toEqual(['X']);
  });

  it('begins a rebind with the clicked slot index', () => {
    const { root, controls } = setup();
    const shoot = rows(root).find((r) => r.children[0]!.textContent === 'Shoot')!;
    shoot.children[1]!.children[0]!.click();
    const index = DEFAULT_BINDINGS.findIndex((b) => b.action === 'shoot' && b.input === 'Space');
    expect(controls.beginRebind).toHaveBeenCalledWith(index);
  });

  it('shows Press… on the listening slot after a change', () => {
    const { root, state, fire } = setup();
    const index = DEFAULT_BINDINGS.findIndex((b) => b.action === 'shoot' && b.input === 'Space');
    state.capture = { kind: 'listening', index };
    fire();
    const shoot = rows(root).find((r) => r.children[0]!.textContent === 'Shoot')!;
    const slot = shoot.children[1]!.children[0]!;
    expect(slot.textContent).toBe('Press…');
    expect(slot.attrs['aria-pressed']).toBe('true');
  });

  it('renders a conflict alert with Swap and Cancel', () => {
    const { root, state, controls, fire } = setup();
    state.message = 'Space is used.';
    state.capture = {
      kind: 'conflict',
      index: 0,
      conflictIndex: 1,
      input: 'Space',
      otherAction: 'shoot',
    };
    fire();
    const alert = all(root, (n) => n.attrs['role'] === 'alert')[0]!;
    const bs = all(alert, (n) => n.tagName === 'button');
    expect(bs.map((b) => b.textContent)).toEqual(['Swap', 'Cancel']);
    bs[0]!.click();
    bs[1]!.click();
    expect(controls.confirmSwap).toHaveBeenCalledTimes(1);
    expect(controls.cancel).toHaveBeenCalledTimes(1);
  });

  it('resets to defaults', () => {
    const { root, controls } = setup();
    all(root, (n) => n.textContent === 'Reset to defaults')[0]!.click();
    expect(controls.resetToDefaults).toHaveBeenCalledTimes(1);
  });

  it('forwards slider changes', () => {
    const { root, controls } = setup();
    const ranges = all(root, (n) => n.attrs['type'] === 'range');
    expect(ranges).toHaveLength(2);
    ranges[0]!.value = '300';
    ranges[0]!.dispatch('change');
    expect(controls.setDoubleClickWindowMs).toHaveBeenCalledWith(300);
    ranges[1]!.value = '2';
    ranges[1]!.dispatch('change');
    expect(controls.setAimSensitivity).toHaveBeenCalledWith(2);
  });

  it('marks the current pass targeting and sets a new one', () => {
    const { root, controls } = setup();
    const toggles = all(root, (n) => n.className.includes('cv-controls-toggle'));
    expect(toggles.map((t) => t.textContent)).toEqual(['Numbered', 'Aim', 'Both']);
    expect(toggles.map((t) => t.attrs['aria-pressed'])).toEqual(['false', 'false', 'true']);
    toggles[1]!.click();
    expect(controls.setPassTargeting).toHaveBeenCalledWith('aim');
  });

  it('cleanup unsubscribes, cancels and removes the root', () => {
    const { root, controls, unsubscribe, cleanup } = setup();
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(controls.cancel).toHaveBeenCalledTimes(1);
    expect(root.removed).toBe(true);
  });

  it('swallows the click that ended a capture', () => {
    const { root, state, fire } = setup();
    state.capture = { kind: 'listening', index: 0 };
    fire();
    root.dispatch('mousedown');
    state.capture = { kind: 'idle' };
    fire();
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    root.dispatch('click', event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    const next = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    root.dispatch('mousedown');
    root.dispatch('click', next);
    expect(next.stopPropagation).not.toHaveBeenCalled();
  });

  it('restores focus to the element with the same focus key after a re-render', () => {
    const { root, doc, fire } = setup();
    const before = all(root, (n) => n.attrs['data-focus-key'] !== undefined)[0]!;
    const key = before.attrs['data-focus-key']!;
    doc.activeElement = before;
    fire();
    const after = all(root, (n) => n.attrs['data-focus-key'] === key)[0]!;
    expect(after).not.toBe(before);
    expect(after.focused).toBe(1);
  });

  it('does not swallow a later click when the capture-ending click never arrived', () => {
    const { root, state, fire } = setup();
    state.capture = { kind: 'listening', index: 0 };
    fire();
    root.dispatch('mousedown');
    state.capture = { kind: 'idle' };
    fire();
    root.dispatch('mousedown');
    const next = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    root.dispatch('click', next);
    expect(next.stopPropagation).not.toHaveBeenCalled();
  });
});
