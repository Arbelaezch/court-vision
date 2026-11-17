import { describe, expect, it, vi } from 'vitest';
import type { MenuLabels, ScreenEvent, ScreenState } from '../app';
import { loadAppContent, sortPlayList } from '../app';
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
  hasListener(type: string): boolean {
    return (this.listeners[type]?.length ?? 0) > 0;
  }
  click(): void {
    this.fire('click');
  }
  fire(type: string): void {
    for (const fn of this.listeners[type] ?? []) fn();
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
  glossary: [
    { id: 'screen', term: 'Screen', text: 'A teammate blocks a defender.' },
    { id: 'cut', term: 'Cut', text: 'A sudden run toward the basket.' },
  ],
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
    bs[0]!.click();
    bs[1]!.click();
    bs[2]!.click();
    expect(events).toEqual([
      { type: 'openTutorialMenu' },
      { type: 'openPractice' },
      { type: 'openScrimmage' },
    ]);
  });

  it('renders the tutorial menu buttons and sends their events', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'tutorialMenu' }, labels);
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual(['Controls tutorial', 'Glossary', 'Back']);
    bs.forEach((b) => b.click());
    expect(events).toEqual([{ type: 'openTutorial' }, { type: 'openGlossary' }, { type: 'back' }]);
  });

  it('renders one dt/dd per glossary entry in order, then Back', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'glossary' }, labels);
    const dl = find(root, (n) => n.tagName === 'dl')!;
    expect(dl.className).toBe('cv-glossary-list');
    expect(dl.children.map((c) => [c.tagName, c.textContent])).toEqual([
      ['dt', 'Screen'],
      ['dd', 'A teammate blocks a defender.'],
      ['dt', 'Cut'],
      ['dd', 'A sudden run toward the basket.'],
    ]);
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual(['Back']);
    bs[0]!.click();
    expect(events).toEqual([{ type: 'back' }]);
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

  describe('non-color channel', () => {
    function expectBadge(badge: FakeEl): void {
      const icon = find(badge, (n) => n.className === 'cv-mastered-icon')!;
      expect(icon.textContent).toBe('✓');
      expect(icon.attrs['aria-hidden']).toBe('true');
      expect(find(badge, (n) => n.className === 'cv-mastered-text')!.textContent).toBe('Mastered');
    }

    it('marks a mastered progress row with a check icon and Mastered text', () => {
      const { menus, root } = setup();
      menus.show({ screen: 'progress' }, progressLabels);
      const tbody = find(root, (n) => n.tagName === 'tbody')!;
      const cells = tbody.children.map((tr) => tr.children[4]!);
      expectBadge(find(cells[2]!, (n) => n.className === 'cv-mastered-badge')!);
    });

    it('says Not yet in non-mastered progress rows', () => {
      const { menus, root } = setup();
      menus.show({ screen: 'progress' }, progressLabels);
      const tbody = find(root, (n) => n.tagName === 'tbody')!;
      for (const i of [0, 1, 3]) {
        expect(tbody.children[i]!.children[4]!.textContent).toBe('Not yet');
      }
    });

    it('puts the same badge in a mastered play button on play select', () => {
      const { menus, root } = setup();
      menus.show({ screen: 'playSelect', modeId: 'practice' }, progressLabels);
      const ol = find(root, (n) => n.tagName === 'ol')!;
      const button = ol.children[1]!.children[0]!;
      expectBadge(find(button, (n) => n.className === 'cv-mastered-badge')!);
    });
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

  it('renders the tutorial bar with an Exit tutorial button and no backdrop', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'tutorial' }, labels);
    expect(root.className).not.toContain('cv-screens-backdrop');
    const bar = find(root, (n) => n.attrs['role'] === 'status')!;
    expect(bar.className).toBe('cv-tutorial-bar');
    expect(bar.children[0]!.textContent).toContain('Esc');
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual(['Exit tutorial']);
    bs[0]!.click();
    expect(events).toEqual([{ type: 'back' }]);
  });

  it('renders a Back button on the settings placeholder', () => {
    const { menus, root, events } = setup();
    menus.show({ screen: 'settings' }, labels);
    const bs = buttons(root);
    expect(bs.map((b) => b.textContent)).toEqual(['Back']);
    bs[0]!.click();
    expect(events).toEqual([{ type: 'back' }]);
  });

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

  it('mounts the settings view, keeps Back, and unmounts on leaving', () => {
    const container = new FakeEl();
    const events: ScreenEvent[] = [];
    const unmount = vi.fn();
    const mount = vi.fn(() => unmount);
    const doc = { createElement: (tag: string) => new FakeEl(tag) };
    const menus = createScreenMenus({
      container: container as unknown as HTMLElement,
      doc: doc as unknown as Document,
      onEvent: (e) => events.push(e),
      settingsView: { mount },
    });
    const root = container.children[0]!;
    menus.show({ screen: 'settings' }, labels);
    expect(mount).toHaveBeenCalledTimes(1);
    const back = buttons(root).find((b) => b.textContent === 'Back')!;
    back.click();
    expect(events).toEqual([{ type: 'back' }]);
    expect(unmount).not.toHaveBeenCalled();
    menus.show({ screen: 'mainMenu' }, labels);
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  describe('keyboard operability', () => {
    const screens: ScreenState[] = [
      { screen: 'mainMenu' },
      { screen: 'tutorialMenu' },
      { screen: 'glossary' },
      { screen: 'settings' },
      { screen: 'progress' },
      { screen: 'playSelect', modeId: 'practice' },
      { screen: 'paused', modeId: 'practice', playId: 'a' },
      { screen: 'tutorial' },
    ];

    function clickable(el: FakeEl): FakeEl[] {
      const out: FakeEl[] = [];
      const walk = (n: FakeEl): void => {
        if (n.hasListener('click')) out.push(n);
        n.children.forEach(walk);
      };
      walk(el);
      return out;
    }

    it.each(screens.map((s) => [s.screen, s] as const))(
      '%s: every clickable element is a type=button button',
      (_name, state) => {
        const { menus, root } = setup();
        menus.show(state, labels);
        const items = clickable(root);
        expect(items.length).toBeGreaterThan(0);
        for (const n of items) {
          expect(n.tagName).toBe('button');
          expect(n.attrs['type']).toBe('button');
        }
      },
    );

    it('makes the glossary list a labelled, focusable region', () => {
      const { menus, root } = setup();
      menus.show({ screen: 'glossary' }, labels);
      const dl = find(root, (n) => n.tagName === 'dl')!;
      expect(dl.attrs['tabindex']).toBe('0');
      expect(dl.attrs['role']).toBe('region');
      expect(dl.attrs['aria-label']).toBeTruthy();
    });

    it('focuses the expected element after show', () => {
      const first = (state: ScreenState, pred: (n: FakeEl) => boolean): FakeEl => {
        const { menus, root } = setup();
        menus.show(state, labels);
        return find(root, pred)!;
      };
      expect(first({ screen: 'mainMenu' }, (n) => n.tagName === 'button').focused).toBe(true);
      expect(first({ screen: 'tutorialMenu' }, (n) => n.tagName === 'button').focused).toBe(true);
      expect(first({ screen: 'glossary' }, (n) => n.tagName === 'dl').focused).toBe(true);
      expect(
        first({ screen: 'progress' }, (n) => n.tagName === 'button' && n.textContent === 'Back')
          .focused,
      ).toBe(true);
      const play = first(
        { screen: 'playSelect', modeId: 'practice' },
        (n) => n.className === 'cv-play-button',
      );
      expect(play.focused).toBe(true);
      expect(play.children[0]!.textContent).toBe('Alpha');
    });

    it('focuses Back on play select when there are no plays', () => {
      const { menus, root } = setup();
      menus.show({ screen: 'playSelect', modeId: 'practice' }, { ...labels, plays: [] });
      expect(buttons(root).map((b) => [b.textContent, b.focused])).toEqual([['Back', true]]);
    });
  });

  describe('play preview', () => {
    function setupPreview() {
      const log: string[] = [];
      let mounts = 0;
      let unmounts = 0;
      let maxLive = 0;
      const playPreview = {
        mount: () => {
          mounts++;
          maxLive = Math.max(maxLive, mounts - unmounts);
          return {
            show: (id: string) => log.push(id),
            unmount: () => {
              unmounts++;
            },
          };
        },
      };
      const container = new FakeEl();
      const events: ScreenEvent[] = [];
      const doc = { createElement: (tag: string) => new FakeEl(tag) };
      const menus = createScreenMenus({
        container: container as unknown as HTMLElement,
        doc: doc as unknown as Document,
        onEvent: (e) => events.push(e),
        playPreview,
      });
      return {
        menus,
        root: container.children[0]!,
        events,
        log,
        counts: () => ({ mounts, unmounts, maxLive }),
      };
    }
    const playSelect: ScreenState = { screen: 'playSelect', modeId: 'practice' };
    const playButtons = (root: FakeEl): FakeEl[] =>
      buttons(root).filter((b) => b.className === 'cv-play-button');

    it('mounts once, shows the first play, and switches on hover and focus', () => {
      const { menus, root, log, counts } = setupPreview();
      menus.show(playSelect, labels);
      expect(counts().mounts).toBe(1);
      expect(log).toEqual(['a']);
      const slot = find(root, (n) => n.className === 'cv-play-preview')!;
      expect(slot.attrs['aria-label']).toBe('Play preview');
      expect(slot.attrs['role']).toBe('img');
      const [alpha, beta] = playButtons(root);
      beta!.fire('mouseenter');
      alpha!.fire('focus');
      expect(log).toEqual(['a', 'b', 'a']);
      expect(counts().mounts).toBe(1);
    });

    it('unmounts on leaving, remounts on re-entry, one live at a time, click still selects', () => {
      const { menus, root, events, counts } = setupPreview();
      menus.show(playSelect, labels);
      menus.show({ screen: 'mainMenu' }, labels);
      expect(counts().unmounts).toBe(1);
      menus.show(playSelect, labels);
      expect(counts().mounts).toBe(2);
      expect(counts().maxLive).toBe(1);
      playButtons(root)[0]!.click();
      expect(events).toEqual([{ type: 'selectPlay', playId: 'a' }]);
    });

    it('renders no preview slot without a playPreview option', () => {
      const { menus, root } = setup();
      menus.show(playSelect, labels);
      expect(find(root, (n) => n.className === 'cv-play-preview')).toBeUndefined();
    });
  });

  it('AC2: every play blurb comes from the play data, in list order', () => {
    const plays = sortPlayList(loadAppContent().plays);
    expect(plays.length).toBeGreaterThan(0);
    for (const p of plays) expect(p.blurb.length).toBeGreaterThan(0);
    const { menus, root } = setup();
    menus.show({ screen: 'playSelect', modeId: 'practice' }, { ...labels, plays });
    const blurbs: string[] = [];
    const walk = (n: FakeEl): void => {
      if (n.className === 'cv-play-blurb') blurbs.push(n.textContent);
      n.children.forEach(walk);
    };
    walk(root);
    expect(blurbs).toEqual(plays.map((p) => p.blurb));
  });
});
