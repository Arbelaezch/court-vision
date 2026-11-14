import { describe, expect, it } from 'vitest';
import type { MenuLabels, ScreenEvent, ScreenState } from '../app';
import { createScreenMenus } from './menus';

class FakeEl {
  tagName: string;
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  className = '';
  textContent = '';
  removed = false;
  focused = false;
  replaceCalls = 0;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(tag = 'div') {
    this.tagName = tag;
  }
  appendChild(c: FakeEl): FakeEl {
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  click(): void {
    for (const fn of this.listeners['click'] ?? []) fn();
  }
  replaceChildren(): void {
    this.replaceCalls++;
    this.children = [];
  }
  focus(): void {
    this.focused = true;
  }
  remove(): void {
    this.removed = true;
  }
}

const labels: MenuLabels = {
  plays: [
    { id: 'a', name: 'Alpha', blurb: 'first blurb', difficulty: 1 },
    { id: 'b', name: 'Beta', blurb: 'second blurb', difficulty: 2 },
  ],
  modeNames: { practice: 'Practice' },
};

function setup() {
  const container = new FakeEl();
  const events: ScreenEvent[] = [];
  const doc = { createElement: (tag: string) => new FakeEl(tag) };
  const menus = createScreenMenus({
    container: container as unknown as HTMLElement,
    doc: doc as unknown as Document,
    onEvent: (e) => events.push(e),
  });
  const root = container.children[0]!;
  return { menus, root, events };
}

function buttons(el: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (n: FakeEl): void => {
    if (n.tagName === 'button') out.push(n);
    n.children.forEach(walk);
  };
  walk(el);
  return out;
}

function find(el: FakeEl, pred: (n: FakeEl) => boolean): FakeEl | undefined {
  if (pred(el)) return el;
  for (const c of el.children) {
    const r = find(c, pred);
    if (r) return r;
  }
  return undefined;
}

describe('createScreenMenus', () => {
  it('renders the main menu buttons in order and sends events', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'mainMenu' }, labels);
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual([
      'Tutorial',
      'Practice',
      'Scrimmage',
      'Settings',
      'Progress',
    ]);
    bs[1]!.click();
    expect(events).toEqual([{ type: 'openPractice' }]);
  });

  it('renders play select in label order and selects by id', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'playSelect', modeId: 'practice' }, labels);
    const ol = find(root, (n) => n.tagName === 'ol')!;
    expect(ol.children.map((li) => li.children[0]!.children[0]!.textContent)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(ol.children[1]!.children[0]!.children[1]!.textContent).toBe('second blurb');
    expect(find(root, (n) => n.tagName === 'h2')!.textContent).toBe('Practice: pick a play');
    ol.children[1]!.children[0]!.click();
    expect(events).toEqual([{ type: 'selectPlay', playId: 'b' }]);
  });

  it('renders the paused dialog with a focused Resume', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'paused', modeId: 'practice', playId: 'a' }, labels);
    const dialog = root.children[0]!;
    expect(dialog.attrs['role']).toBe('dialog');
    expect(dialog.attrs['aria-modal']).toBe('true');
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual(['Resume', 'Restart', 'Quit']);
    expect(bs[0]!.focused).toBe(true);
    bs.forEach((b) => b.click());
    expect(events).toEqual([{ type: 'resume' }, { type: 'restart' }, { type: 'quit' }]);
  });

  it.each(['tutorial', 'scrimmage', 'settings', 'progress'] as const)(
    'renders a Back button on the %s placeholder',
    (screen) => {
      const { menus, root, events } = setup();
      menus.show({ screen }, labels);
      const bs = buttons(root);
      expect(bs.map((b) => b.textContent)).toEqual(['Back']);
      bs[0]!.click();
      expect(events).toEqual([{ type: 'back' }]);
    },
  );

  it('renders a status HUD with the play name and no buttons in run', () => {
    const { menus, root } = setup();
    menus.show({ screen: 'inRun', modeId: 'practice', playId: 'b' }, labels);
    const hud = root.children[0]!;
    expect(hud.attrs['role']).toBe('status');
    expect(hud.textContent).toContain('Beta');
    expect(buttons(root)).toHaveLength(0);
  });

  it('does not rebuild for an equal state', () => {
    const { menus, root } = setup();
    const s: ScreenState = { screen: 'playSelect', modeId: 'practice' };
    menus.show(s, labels);
    menus.show({ ...s }, labels);
    expect(root.replaceCalls).toBe(1);
    menus.show({ screen: 'mainMenu' }, labels);
    expect(root.replaceCalls).toBe(2);
  });

  it('removes the root on dispose', () => {
    const { menus, root } = setup();
    menus.dispose();
    expect(root.removed).toBe(true);
  });
});
