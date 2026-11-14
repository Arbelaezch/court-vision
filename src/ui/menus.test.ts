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
  progressModes: [
    { id: 'practice', name: 'Practice' },
    { id: 'scrimmage', name: 'Scrimmage' },
  ],
  progress: ['a', 'b'].map((playId) => ({
    playId,
    modes: ['practice', 'scrimmage'].map((modeId) => ({
      modeId,
      attempts: 0,
      successes: 0,
      mastered: false,
    })),
  })),
  masteredSuccesses: 10,
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

  const progressLabels: MenuLabels = {
    ...labels,
    progress: labels.progress.map((r) =>
      r.playId === 'b'
        ? {
            ...r,
            modes: r.modes.map((m) =>
              m.modeId === 'practice' ? { ...m, attempts: 12, successes: 10, mastered: true } : m,
            ),
          }
        : r,
    ),
  };

  it('shows counts and a Mastered badge on play select', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'playSelect', modeId: 'practice' }, progressLabels);
    const ol = find(root, (n) => n.tagName === 'ol')!;
    const a = ol.children[0]!.children[0]!;
    const b = ol.children[1]!.children[0]!;
    expect(a.children[0]!.textContent).toBe('Alpha');
    expect(a.children[1]!.textContent).toBe('first blurb');
    expect(a.children[2]!.textContent).toBe('0 attempts · 0 successes');
    expect(find(a, (n) => n.className === 'cv-mastered-badge')).toBeUndefined();
    expect(b.children[2]!.textContent).toBe('12 attempts · 10 successes');
    const badge = find(b, (n) => n.className === 'cv-mastered-badge')!;
    expect(badge.children[0]!.attrs['aria-hidden']).toBe('true');
    expect(badge.children[0]!.textContent).not.toBe('');
    expect(badge.children[1]!.textContent).toBe('Mastered');
    a.click();
    b.click();
    expect(events).toEqual([
      { type: 'selectPlay', playId: 'a' },
      { type: 'selectPlay', playId: 'b' },
    ]);
  });

  it('uses singular counts on play select', () => {
    const { menus, root } = setup();
    const one: MenuLabels = {
      ...labels,
      progress: [
        {
          playId: 'a',
          modes: [{ modeId: 'practice', attempts: 1, successes: 1, mastered: false }],
        },
      ],
    };
    menus.show({ screen: 'playSelect', modeId: 'practice' }, one);
    expect(find(root, (n) => n.className === 'cv-play-progress')!.textContent).toBe(
      '1 attempt · 1 success',
    );
  });

  it('shows the scrimmage counts on play select for scrimmage', () => {
    const { menus, root } = setup();
    menus.show({ screen: 'playSelect', modeId: 'scrimmage' }, progressLabels);
    const ol = find(root, (n) => n.tagName === 'ol')!;
    const b = ol.children[1]!.children[0]!;
    expect(b.children[2]!.textContent).toBe('0 attempts · 0 successes');
    expect(find(b, (n) => n.className === 'cv-mastered-badge')).toBeUndefined();
  });

  it('renders the progress table', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'progress' }, progressLabels);
    expect(find(root, (n) => n.tagName === 'h2')!.textContent).toBe('Progress');
    expect(find(root, (n) => n.className === 'cv-progress-note')!.textContent).toContain('10');
    const table = find(root, (n) => n.tagName === 'table')!;
    const tbody = find(table, (n) => n.tagName === 'tbody')!;
    expect(tbody.children).toHaveLength(4);
    expect(tbody.children.map((tr) => tr.children[0]!.textContent)).toEqual([
      'Alpha',
      'Alpha',
      'Beta',
      'Beta',
    ]);
    const cells = tbody.children.map((tr) => tr.children[4]!);
    expect(find(cells[2]!, (n) => n.className === 'cv-mastered-badge')).toBeDefined();
    expect([0, 1, 3].map((i) => cells[i]!.textContent)).toEqual(['Not yet', 'Not yet', 'Not yet']);
    const bs = buttons(root);
    expect(bs.map((x) => x.textContent)).toEqual(['Back']);
    bs[0]!.click();
    expect(events).toEqual([{ type: 'back' }]);
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

  it.each(['tutorial', 'scrimmage', 'settings'] as const)(
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
