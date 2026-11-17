import { describe, expect, it } from 'vitest';
import type { RunControllerState } from '../ai';
import type { PlayScenario } from '../content';
import type { GameEvent } from '../sim';
import { loadAppContent } from './boot';
import { createAppFlow, sortPlayList, type AppFlow, type FlowStep } from './appFlow';
import type { TutorialFrame } from './tutorialPrompt';
import type { RunFrame } from './runFrame';
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

  it('lists the bundled plays easiest first', () => {
    expect(sortPlayList(CONTENT.plays).map((p) => p.id)).toEqual([
      'giveAndGo',
      'driveAndKick',
      'dribbleHandoff',
      'highPickAndRoll',
      'hornsSet',
    ]);
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
    expect(flow.state()).toEqual({ screen: 'playSelect', modeId: 'scrimmage' });
  });

  it('starts a live 5-on-5 Scrimmage Give-and-Go run with a full shot clock', () => {
    const runs: RunControllerState[] = [];
    const frames: RunFrame[] = [];
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const flow = createAppFlow({
      content: CONTENT,
      store,
      renderer: {
        drawRun: (c, f) => {
          runs.push(c);
          frames.push(f);
        },
        clear: () => {},
      },
      seed: () => 1,
    });
    flow.send({ type: 'openScrimmage' });
    flow.send({ type: 'selectPlay', playId: GIVE_AND_GO.id });
    expect(flow.state()).toEqual({ screen: 'inRun', modeId: 'scrimmage', playId: GIVE_AND_GO.id });
    flow.frame(16);
    const run = runs[runs.length - 1]!;
    expect(run.mode.id).toBe('scrimmage');
    expect(run.game.players).toHaveLength(10);
    expect(run.game.defenseMode).toBe('live');
    expect(GIVE_AND_GO.coverages.map((c) => c.id)).toContain(run.referee.coverageId);
    expect(frames[frames.length - 1]!.hud.shotClockSeconds).toBe(24);
  });

  it.each(['openPractice', 'openScrimmage'] as const)(
    'cue toggles hide their cue kinds in a %s run, and default toggles show them',
    (open) => {
      const run = (hide: boolean) => {
        const frames: RunFrame[] = [];
        const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
        if (hide) {
          store.set('settings', {
            ...store.get('settings'),
            cues: { floorArrows: false, targetRings: false, prompts: false },
          });
        }
        const flow = createAppFlow({
          content: CONTENT,
          store,
          renderer: { drawRun: (_c, f) => frames.push(f), clear: () => {} },
          seed: () => 1,
        });
        flow.send({ type: open });
        flow.send({ type: 'selectPlay', playId: GIVE_AND_GO.id });
        for (let i = 0; i < 120; i += 1) flow.frame(16);
        return frames;
      };
      const shown = run(false);
      expect(shown.some((f) => f.cues.length > 0)).toBe(true);
      const hidden = run(true);
      expect(hidden.length).toBeGreaterThan(0);
      for (const f of hidden) {
        expect(f.cues).toEqual([]);
        expect(f.prompt).toBeNull();
      }
    },
  );

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

  it('forwards step events to sinks in order and hands drawRun a frame', () => {
    const events: GameEvent[] = [];
    const frames: RunFrame[] = [];
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const flow = createAppFlow({
      content: CONTENT,
      store,
      renderer: { drawRun: (_c, f) => frames.push(f), clear: () => {} },
      seed: () => 1,
      actionsFor: (c) => [
        {
          type: 'pass',
          passType: 'chestPass',
          targetId: c.game.players.find((p) => p.role === 'SF' && p.side === 'offense')?.id ?? -1,
        },
      ],
      eventSinks: [(e) => events.push(e)],
    });
    toRun(flow);
    for (let i = 0; i < 5; i++) flow.frame(1000 / 60);
    const stepEvents = frames.flatMap((f) => f.steps.flatMap((s) => s.events));
    expect(events.length).toBeGreaterThan(0);
    expect(events).toEqual(stepEvents);
    expect(events.some((e) => e.type === 'mistake')).toBe(true);
    expect(frames[0]?.hud.objective).toBe(GIVE_AND_GO.concept);
  });

  it('calls step sinks once per run step with game, events and reset; event sinks still fire', () => {
    const events: GameEvent[] = [];
    const calls: FlowStep[] = [];
    const frames: RunFrame[] = [];
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const flow = createAppFlow({
      content: CONTENT,
      store,
      renderer: { drawRun: (_c, f) => frames.push(f), clear: () => {} },
      seed: () => 1,
      eventSinks: [(e) => events.push(e)],
      stepSinks: [(s) => calls.push(s)],
    });
    toRun(flow);
    for (let i = 0; i < 5; i++) flow.frame(1000 / 60);
    const steps = frames.flatMap((f) => f.steps);
    expect(steps.length).toBeGreaterThan(0);
    expect(calls.length).toBe(steps.length);
    calls.forEach((c, i) => {
      expect(c.game).toBe(steps[i]!.controller.game);
      expect(c.events).toEqual(steps[i]!.events);
      expect(c.reset).toBe(steps[i]!.reset);
    });
    expect(events).toEqual(steps.flatMap((s) => s.events));
  });

  it('calls step sinks once per tutorial step with game, events and reset', () => {
    const events: GameEvent[] = [];
    const calls: FlowStep[] = [];
    const frames: TutorialFrame[] = [];
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const flow = createAppFlow({
      content: CONTENT,
      store,
      renderer: { drawRun: () => {}, clear: () => {} },
      tutorialRenderer: { drawTutorial: (f) => frames.push(f), clearTutorial: () => {} },
      eventSinks: [(e) => events.push(e)],
      stepSinks: [(s) => calls.push(s)],
      seed: () => 5,
    });
    flow.send({ type: 'openTutorialMenu' });
    flow.send({ type: 'openTutorial' });
    for (let i = 0; i < 5; i++) flow.frame(1000 / 60);
    const steps = frames.flatMap((f) => f.steps);
    expect(steps.length).toBeGreaterThan(0);
    expect(calls.length).toBe(steps.length);
    calls.forEach((c, i) => {
      expect(c.game).toBe(steps[i]!.game);
      expect(c.events).toEqual(steps[i]!.events);
      expect(c.reset).toBe(steps[i]!.reset);
    });
    expect(events).toEqual(steps.flatMap((s) => s.events));
  });

  it('forwards non-pause presses only while inRun', () => {
    const pressed: string[] = [];
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const flow = createAppFlow({
      content: CONTENT,
      store,
      renderer: { drawRun: () => {}, clear: () => {} },
      onPress: (a) => pressed.push(a),
    });
    flow.handleAction('chestPass');
    flow.send({ type: 'openPractice' });
    flow.handleAction('chestPass');
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    flow.handleAction('chestPass');
    flow.handleAction('pause');
    flow.handleAction('chestPass');
    expect(pressed).toEqual(['chestPass']);
  });

  it('labels carry the glossary terms', () => {
    expect(setup().flow.labels().glossary).toEqual(CONTENT.glossary.terms);
    expect(CONTENT.glossary.terms.length).toBeGreaterThan(0);
  });

  it('labels carry the mastery threshold', () => {
    expect(setup().flow.labels().masteredSuccesses).toBe(10);
  });
});
