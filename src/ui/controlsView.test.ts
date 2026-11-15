import { describe, expect, it, vi } from 'vitest';
import {
  CONTROL_ACTIONS,
  type AudioSettings,
  type CaptureState,
  type ControlSettings,
  type DisplaySettings,
  type ProgressReset,
} from '../app';
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

function setup(withAudio = false) {
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
  const audioState = { volume: 0.6, musicOn: false, sfxOn: true };
  let audioListener: (() => void) | null = null;
  const audioUnsubscribe = vi.fn(() => {
    audioListener = null;
  });
  const audio = {
    settings: () => ({ ...audioState }),
    setVolume: vi.fn(),
    setMusicOn: vi.fn(),
    setSfxOn: vi.fn(),
    onChange: (l: () => void) => {
      audioListener = l;
      return audioUnsubscribe;
    },
    dispose: vi.fn(),
  };
  const view = createControlsView({
    doc: doc as unknown as Document,
    controls: controls as unknown as ControlSettings,
    ...(withAudio ? { audio: audio as unknown as AudioSettings } : {}),
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
    audio,
    audioState,
    audioUnsubscribe,
    fireAudio: () => audioListener?.(),
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

  it('has no Audio section without an audio option', () => {
    const { root } = setup();
    expect(all(root, (n) => n.attrs['id'] === 'cv-audio-volume')).toHaveLength(0);
    expect(all(root, (n) => n.textContent === 'Audio')).toHaveLength(0);
  });

  it('renders the Audio section with the stored volume and wires the slider', () => {
    const { root, audio } = setup(true);
    expect(all(root, (n) => n.textContent === 'Audio')).toHaveLength(1);
    const volume = all(root, (n) => n.attrs['id'] === 'cv-audio-volume')[0]!;
    expect(volume.value).toBe('0.6');
    volume.value = '0.35';
    volume.dispatch('change');
    expect(audio.setVolume).toHaveBeenCalledWith(0.35);
  });

  it('wires the Music and Sound effects toggles and reflects state after re-render', () => {
    const { root, audio, audioState, fireAudio } = setup(true);
    const toggle = (label: string): FakeEl =>
      all(root, (n) => n.textContent === label && n.tagName === 'button')[0]!;
    expect(toggle('Music').attrs['aria-pressed']).toBe('false');
    expect(toggle('Sound effects').attrs['aria-pressed']).toBe('true');
    toggle('Music').click();
    expect(audio.setMusicOn).toHaveBeenCalledWith(true);
    toggle('Sound effects').click();
    expect(audio.setSfxOn).toHaveBeenCalledWith(false);
    audioState.musicOn = true;
    audioState.sfxOn = false;
    fireAudio();
    expect(toggle('Music').attrs['aria-pressed']).toBe('true');
    expect(toggle('Sound effects').attrs['aria-pressed']).toBe('false');
  });

  it('unsubscribes from audio changes on cleanup', () => {
    const { cleanup, audioUnsubscribe } = setup(true);
    cleanup();
    expect(audioUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('has no display or progress sections without those options', () => {
    const { root } = setup();
    for (const h of ['Cue visibility', 'Accessibility', 'Progress']) {
      expect(all(root, (n) => n.textContent === h)).toHaveLength(0);
    }
  });
});

function setupExtras() {
  const base = setup();
  const state = {
    cues: { floorArrows: true, targetRings: false, prompts: true },
    reduceMotion: false,
    cuePending: null as { kind: 'cueOff'; cue: 'floorArrows' } | null,
    resetPending: false,
    resetMessage: null as string | null,
  };
  const listeners: (() => void)[] = [];
  const unsubs = { display: vi.fn(), reset: vi.fn() };
  const display = {
    cues: () => state.cues,
    reduceMotion: () => state.reduceMotion,
    setCueToggle: vi.fn(),
    pending: () => state.cuePending,
    confirm: vi.fn(),
    cancel: vi.fn(),
    setReduceMotion: vi.fn(),
    onChange: (l: () => void) => {
      listeners.push(l);
      return unsubs.display;
    },
    dispose: vi.fn(),
  };
  const progressReset = {
    pending: () => state.resetPending,
    message: () => state.resetMessage,
    request: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    onChange: (l: () => void) => {
      listeners.push(l);
      return unsubs.reset;
    },
    dispose: vi.fn(),
  };
  const view = createControlsView({
    doc: base.doc as unknown as Document,
    controls: base.controls as unknown as ControlSettings,
    display: display as unknown as DisplaySettings,
    progressReset: progressReset as unknown as ProgressReset,
  });
  const parent = new FakeEl();
  const cleanup = view.mount(parent as unknown as HTMLElement);
  const root = parent.children[0]!;
  const byKey = (key: string): FakeEl =>
    all(root, (n) => n.attrs['data-focus-key'] === key)[0] as FakeEl;
  return {
    state,
    display,
    progressReset,
    unsubs,
    root,
    cleanup,
    byKey,
    doc: base.doc,
    // Every listener re-renders the whole view, so one is enough (firing both would render twice).
    fire: () => {
      listeners[0]?.();
    },
  };
}

describe('createControlsView display and progress sections', () => {
  it('renders the three cue toggles with aria-pressed from the stored values', () => {
    const { root, byKey } = setupExtras();
    expect(all(root, (n) => n.textContent === 'Cue visibility')).toHaveLength(1);
    expect(byKey('cue-floorArrows').attrs['aria-pressed']).toBe('true');
    expect(byKey('cue-targetRings').attrs['aria-pressed']).toBe('false');
    expect(byKey('cue-prompts').attrs['aria-pressed']).toBe('true');
    expect(all(root, (n) => n.className === 'cv-controls-note').map((n) => n.textContent)).toEqual([
      'Modes still set the most cues you can see. Scrimmage shows fewer than Practice.',
    ]);
  });

  it('toggles a cue through setCueToggle', () => {
    const { byKey, display } = setupExtras();
    byKey('cue-floorArrows').click();
    expect(display.setCueToggle).toHaveBeenCalledWith('floorArrows', false);
    byKey('cue-targetRings').click();
    expect(display.setCueToggle).toHaveBeenCalledWith('targetRings', true);
  });

  it('renders the cue confirmation with Hide and Cancel and focuses Cancel', () => {
    const { root, state, display, fire, byKey } = setupExtras();
    expect(all(root, (n) => n.attrs['role'] === 'alert')).toHaveLength(0);
    state.cuePending = { kind: 'cueOff', cue: 'floorArrows' };
    fire();
    const alert = all(root, (n) => n.attrs['role'] === 'alert')[0]!;
    expect(alert.children[0]!.textContent).toBe(
      'Hide floor arrows in Practice and Scrimmage? Runs still count toward Mastery.',
    );
    const bs = all(alert, (n) => n.tagName === 'button');
    expect(bs.map((b) => b.textContent)).toEqual(['Hide', 'Cancel']);
    expect(byKey('cue-cancel').focused).toBe(1);
    bs[0]!.click();
    bs[1]!.click();
    expect(display.confirm).toHaveBeenCalledTimes(1);
    expect(display.cancel).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the cue toggle when its confirmation closes', () => {
    const { state, doc, fire, byKey } = setupExtras();
    state.cuePending = { kind: 'cueOff', cue: 'floorArrows' };
    fire();
    doc.activeElement = byKey('cue-cancel');
    state.cuePending = null;
    fire();
    expect(byKey('cue-floorArrows').focused).toBe(1);
  });

  it('toggles Reduce motion', () => {
    const { byKey, display, state, fire } = setupExtras();
    expect(byKey('motion-reduce').attrs['aria-pressed']).toBe('false');
    byKey('motion-reduce').click();
    expect(display.setReduceMotion).toHaveBeenCalledWith(true);
    state.reduceMotion = true;
    fire();
    expect(byKey('motion-reduce').attrs['aria-pressed']).toBe('true');
    byKey('motion-reduce').click();
    expect(display.setReduceMotion).toHaveBeenLastCalledWith(false);
  });

  it('requests a progress reset and renders the confirmation', () => {
    const { root, state, progressReset, fire, byKey } = setupExtras();
    byKey('progress-reset').click();
    expect(progressReset.request).toHaveBeenCalledTimes(1);
    state.resetPending = true;
    fire();
    const alert = all(root, (n) => n.attrs['role'] === 'alert')[0]!;
    expect(alert.children[0]!.textContent).toContain('This cannot be undone.');
    expect(byKey('progress-cancel').focused).toBe(1);
    byKey('progress-confirm').click();
    byKey('progress-cancel').click();
    expect(progressReset.confirm).toHaveBeenCalledTimes(1);
    expect(progressReset.cancel).toHaveBeenCalledTimes(1);
  });

  it('puts Progress last and shows the reset message in the status element', () => {
    const { root, state, fire } = setupExtras();
    state.resetMessage = 'Progress reset.';
    fire();
    const status = all(
      root,
      (n) => n.attrs['aria-live'] === 'polite' && n.attrs['role'] === 'status',
    );
    expect(status.map((s) => s.textContent)).toContain('Progress reset.');
    const last = root.children[root.children.length - 1]!;
    expect(last).toBe(status[status.length - 1]);
    const headings = all(root, (n) => n.tagName === 'h3').map((h) => h.textContent);
    expect(headings[headings.length - 1]).toBe('Progress');
  });

  it('cleanup unsubscribes and cancels display and reset confirmations', () => {
    const { cleanup, unsubs, display, progressReset } = setupExtras();
    cleanup();
    expect(unsubs.display).toHaveBeenCalledTimes(1);
    expect(unsubs.reset).toHaveBeenCalledTimes(1);
    expect(display.cancel).toHaveBeenCalledTimes(1);
    expect(progressReset.cancel).toHaveBeenCalledTimes(1);
  });
});
