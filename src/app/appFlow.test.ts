import { describe, expect, it } from 'vitest';
import type { RunControllerState } from '../ai';
import type { PlayScenario } from '../content';
import { loadAppContent } from './boot';
import { createAppFlow, sortPlayList, type AppFlow } from './appFlow';
import { createSaveStore, recordRunAttempt } from './storage';
import { createFakeStorage } from './storage/fakeStorage';

const CONTENT = loadAppContent();
const GIVE_AND_GO = CONTENT.plays.giveAndGo as PlayScenario;

function setup() {
  const drawn: RunControllerState[] = [];
  const counts = { clear: 0 };
  const hidden = { value: false };
  const target = new EventTarget();
  const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
  const flow = createAppFlow({
    content: CONTENT,
    store,
    renderer: {
      drawRun: (c) => drawn.push(c),
      clear: () => {
        counts.clear++;
      },
    },
    seed: () => 1,
    visibility: { target, isHidden: () => hidden.value },
  });
  return { flow, store, drawn, counts, hidden, target };
}

function toRun(flow: AppFlow) {
  flow.send({ type: 'openPractice' });
  return flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
}

function session(flow: AppFlow) {
  const s = flow.session();
  if (s === null) throw new Error('no session');
  return s;
}

describe('sortPlayList', () => {
  it('orders by difficulty then id', () => {
    const make = (id: string, difficulty: number): PlayScenario => ({
      ...GIVE_AND_GO,
      id,
      difficulty,
    });
    const table = { b: make('b', 2), a2: make('a2', 1), a1: make('a1', 1) };
    expect(sortPlayList(table).map((p) => p.id)).toEqual(['a1', 'a2', 'b']);
  });
});

describe('app flow', () => {
  it('rejects selectPlay with an unknown id', () => {
    const { flow } = setup();
    flow.send({ type: 'openPractice' });
    const r = flow.send({ type: 'selectPlay', playId: 'nope' });
    expect(r.ok).toBe(false);
    expect(flow.state().screen).toBe('playSelect');
    expect(flow.session()).toBeNull();
  });

  it('pauses and resumes with the pause action', () => {
    const { flow } = setup();
    toRun(flow);
    expect(flow.state().screen).toBe('inRun');
    flow.handleAction('pause');
    expect(flow.state().screen).toBe('paused');
    expect(session(flow).clock.pauseReason()).toBe('player');
    flow.handleAction('pause');
    expect(flow.state().screen).toBe('inRun');
    expect(session(flow).clock.isPaused()).toBe(false);
  });

  it('a hidden tab pauses and showing it does not resume', () => {
    const { flow, hidden, target } = setup();
    toRun(flow);
    hidden.value = true;
    target.dispatchEvent(new Event('visibilitychange'));
    expect(flow.state().screen).toBe('paused');
    expect(session(flow).clock.pauseReason()).toBe('hidden');
    hidden.value = false;
    target.dispatchEvent(new Event('visibilitychange'));
    expect(flow.state().screen).toBe('paused');
  });

  it('frame while paused freezes the game but still draws', () => {
    const { flow, drawn } = setup();
    toRun(flow);
    flow.handleAction('pause');
    const before = session(flow).state().game.tick;
    const draws = drawn.length;
    flow.frame(16);
    expect(session(flow).state().game.tick).toBe(before);
    expect(drawn.length).toBe(draws + 1);
  });

  it('restart from paused records no attempt', () => {
    const { flow, store } = setup();
    toRun(flow);
    flow.send({ type: 'pause' });
    const r = flow.send({ type: 'restart' });
    expect(r.ok).toBe(true);
    expect(flow.state().screen).toBe('inRun');
    expect(session(flow).state().runIndex).toBe(1);
    expect(session(flow).clock.isPaused()).toBe(false);
    expect(store.get('progress').plays).toEqual({});
  });

  it('quit from paused ends the session', () => {
    const { flow, store, drawn, counts } = setup();
    toRun(flow);
    flow.send({ type: 'pause' });
    flow.send({ type: 'quit' });
    expect(flow.state()).toEqual({ screen: 'playSelect', modeId: 'practice' });
    expect(flow.session()).toBeNull();
    expect(counts.clear).toBe(1);
    expect(store.get('progress').plays).toEqual({});
    const draws = drawn.length;
    expect(() => flow.frame(16)).not.toThrow();
    expect(drawn.length).toBe(draws);
  });

  it('quit then re-select starts a fresh session with a fresh visibility binding', () => {
    const { flow, store, hidden, target } = setup();
    const removed: string[] = [];
    const originalRemove = target.removeEventListener.bind(target);
    target.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type);
      return (originalRemove as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof target.removeEventListener;

    toRun(flow);
    const first = session(flow);
    flow.send({ type: 'pause' });
    flow.send({ type: 'quit' });
    expect(removed).toContain('visibilitychange');

    flow.send({ type: 'openPractice' });
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    const second = session(flow);
    expect(second).not.toBe(first);
    expect(second.state().runIndex).toBe(0);
    expect(store.get('progress').plays).toEqual({});
    expect(flow.state().screen).toBe('inRun');

    hidden.value = true;
    target.dispatchEvent(new Event('visibilitychange'));
    expect(flow.state().screen).toBe('paused');
    expect(second.clock.pauseReason()).toBe('hidden');
    expect(first.clock.pauseReason()).not.toBe('hidden');

    hidden.value = false;
    flow.send({ type: 'resume' });
    expect(flow.state().screen).toBe('inRun');
    expect(second.clock.isPaused()).toBe(false);
  });

  it('the pause action goes back outside a run and is ignored in the main menu', () => {
    const { flow } = setup();
    flow.handleAction('pause');
    expect(flow.state().screen).toBe('mainMenu');
    flow.send({ type: 'openPractice' });
    flow.handleAction('pause');
    expect(flow.state().screen).toBe('mainMenu');
  });

  it('ignores other actions on every screen', () => {
    const { flow } = setup();
    flow.handleAction('chestPass');
    expect(flow.state().screen).toBe('mainMenu');
    flow.send({ type: 'openPractice' });
    flow.handleAction('chestPass');
    expect(flow.state().screen).toBe('playSelect');
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    flow.handleAction('chestPass');
    expect(flow.state().screen).toBe('inRun');
    flow.handleAction('pause');
    flow.handleAction('chestPass');
    expect(flow.state().screen).toBe('paused');
  });

  it('rejects an illegal event in a run and keeps the session', () => {
    const { flow } = setup();
    toRun(flow);
    expect(flow.send({ type: 'openSettings' }).ok).toBe(false);
    expect(flow.state().screen).toBe('inRun');
    expect(flow.session()).not.toBeNull();
  });

  it('labels list every play with zero progress in practice and scrimmage', () => {
    const { flow } = setup();
    const labels = flow.labels();
    expect(labels.progress.map((r) => r.playId)).toEqual(labels.plays.map((p) => p.id));
    for (const row of labels.progress) {
      expect(row.modes).toEqual([
        { modeId: 'practice', attempts: 0, successes: 0, mastered: false },
        { modeId: 'scrimmage', attempts: 0, successes: 0, mastered: false },
      ]);
    }
  });

  it('every play starts from an empty store', () => {
    const { flow } = setup();
    for (const play of flow.labels().plays) {
      flow.send({ type: 'openPractice' });
      expect(flow.send({ type: 'selectPlay', playId: play.id }).ok).toBe(true);
      flow.send({ type: 'pause' });
      flow.send({ type: 'quit' });
      expect(flow.state().screen).toBe('playSelect');
      flow.send({ type: 'back' });
      expect(flow.state().screen).toBe('mainMenu');
    }
  });

  it('opens Scrimmage from the main menu with an empty store', () => {
    const { flow } = setup();
    expect(flow.send({ type: 'openScrimmage' }).ok).toBe(true);
  });

  it('labels reflect a run recorded after the flow was created', () => {
    const { flow, store } = setup();
    recordRunAttempt(store, { playId: 'giveAndGo', modeId: 'practice', success: true });
    const row = flow.labels().progress.find((r) => r.playId === 'giveAndGo');
    expect(row?.modes[0]).toEqual({
      modeId: 'practice',
      attempts: 1,
      successes: 1,
      mastered: false,
    });
  });

  it('labels carry the mastery threshold', () => {
    expect(setup().flow.labels().masteredSuccesses).toBe(10);
  });
});
