import { describe, expect, it } from 'vitest';
import type { RunControllerState } from '../../src/ai';
import {
  bootApp,
  createHumanInput,
  createSaveStore,
  loadAppContent,
  type RunFrame,
} from '../../src/app';
import { createFakeStorage } from '../../src/app/storage/fakeStorage';
import { BUNDLED_PLAY_SOURCES } from '../../src/content';

describe('app boot smoke', () => {
  it('boots headless, reaches a run, pauses and quits', () => {
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const drawn: RunControllerState[] = [];
    const flow = bootApp({
      store,
      renderer: { drawRun: (c) => drawn.push(c), clear: () => {} },
      seed: () => 1,
      visibility: { target: new EventTarget(), isHidden: () => false },
    });

    expect(flow.state().screen).toBe('mainMenu');
    const labels = flow.labels();
    expect(labels.plays).toHaveLength(BUNDLED_PLAY_SOURCES.length);
    expect(labels.plays.map((p) => p.id)).toContain('giveAndGo');
    expect(labels.modeNames.practice).toBeTruthy();

    expect(flow.send({ type: 'openPractice' }).ok).toBe(true);
    const first = labels.plays[0];
    if (first === undefined) throw new Error('no plays');
    expect(flow.send({ type: 'selectPlay', playId: first.id }).ok).toBe(true);
    expect(flow.state().screen).toBe('inRun');

    for (let i = 0; i < 10; i++) flow.frame(1000 / 60);
    const last = drawn[drawn.length - 1];
    expect(last?.playId).toBe('giveAndGo');
    expect(last?.status).not.toBe('quit');

    flow.handleAction('pause');
    expect(flow.state().screen).toBe('paused');
    flow.send({ type: 'quit' });
    expect(flow.state().screen).toBe('playSelect');
    expect(store.get('progress').plays).toEqual({});
  });

  it('draws a frame with the objective and Full cues through the human input path', () => {
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const frames: RunFrame[] = [];
    const events: unknown[] = [];
    const human = createHumanInput({
      held: () => ({ axes: { x: 0, y: 0 }, sprint: false, pivot: false }),
      aimAt: () => null,
      targeting: () => ({ mode: 'both', aimSensitivity: 1 }),
    });
    const flow = bootApp({
      store,
      renderer: { drawRun: (_c, f) => frames.push(f), clear: () => {} },
      seed: () => 1,
      visibility: { target: new EventTarget(), isHidden: () => false },
      actionsFor: human.actionsFor,
      eventSinks: [(e) => events.push(e)],
      onPress: human.press,
    });
    flow.send({ type: 'openPractice' });
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    for (let i = 0; i < 5; i++) flow.frame(1000 / 60);
    const last = frames[frames.length - 1];
    expect(last?.hud.objective).toBe(loadAppContent().plays['giveAndGo']?.concept);
    expect(last?.cues.length).toBeGreaterThan(0);
  });
});
