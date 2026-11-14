import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from '../content';
import { createInputMapper } from '../input';
import { createFakeScheduler } from '../input/fakeScheduler';
import type { GameState, SimAction } from '../sim';
import { loadAppContent } from './boot';
import { createAppFlow, type AppFlow } from './appFlow';
import { createControlSettings } from './controlSettings';
import { createSaveStore } from './storage';
import { createFakeStorage } from './storage/fakeStorage';
import type { TutorialFrame } from './tutorialPrompt';

const CONTENT = loadAppContent();
const FRAME_MS = 1000 / 60;

function setup(scripted: boolean) {
  const frames: TutorialFrame[] = [];
  const counts = { clear: 0 };
  const presses: string[] = [];
  const storage = createFakeStorage({});
  const store = createSaveStore({ storage, warn: () => {} });
  // eslint-disable-next-line prefer-const
  let flow: AppFlow;
  function driver(game: GameState): SimAction[] {
    const step = TUTORIAL_STEPS[flow.tutorial()!.state().stepIndex]!;
    // The first SG in the list is the human's teammate (offense is built first).
    const sg = game.players.find((p) => p.role === 'SG');
    switch (step.id) {
      case 'move':
        return [{ type: 'move', x: 1, z: 0 }];
      case 'sprint':
        return [
          { type: 'move', x: 1, z: 0 },
          { type: 'sprint', held: true },
        ];
      case 'chestPass':
      case 'bouncePass':
      case 'lob':
        return game.ball.kind === 'held' && sg !== undefined
          ? [{ type: 'pass', passType: step.id, targetId: sg.id }]
          : [];
      case 'shoot':
        return [{ type: 'shoot' }];
      case 'floater':
        return [{ type: 'floater' }];
    }
  }
  flow = createAppFlow({
    content: CONTENT,
    store,
    renderer: { drawRun: () => {}, clear: () => {} },
    tutorialRenderer: {
      drawTutorial: (f) => frames.push(f),
      clearTutorial: () => {
        counts.clear++;
      },
    },
    tutorialActionsFor: scripted ? driver : () => [],
    onPress: (a) => presses.push(a),
    seed: () => 5,
  });
  return { flow, store, storage, frames, counts, presses };
}

/** Frames until the predicate holds; throws if it never does. */
function runUntil(flow: AppFlow, done: () => boolean, maxFrames = 6000): void {
  for (let i = 0; i < maxFrames; i++) {
    if (done()) return;
    flow.frame(FRAME_MS);
  }
  throw new Error('condition not reached');
}

function stepIndex(flow: AppFlow): number {
  return flow.tutorial()?.state().stepIndex ?? -1;
}

describe('tutorial flow', () => {
  it('AC1: opens a tutorial session, idle input stays on step 1, the driver goes through 1..7', () => {
    const idle = setup(false);
    idle.flow.send({ type: 'openTutorial' });
    expect(idle.flow.tutorial()).not.toBeNull();
    expect(idle.flow.session()).toBeNull();
    for (let i = 0; i < 600; i++) idle.flow.frame(FRAME_MS);
    expect(idle.flow.tutorial()!.state().stepIndex).toBe(0);

    const { flow, frames } = setup(true);
    flow.send({ type: 'openTutorial' });
    runUntil(flow, () => flow.state().screen === 'mainMenu' && frames.length > 0);
    const seen: number[] = [];
    for (const f of frames) {
      const n = Number(/Step (\d+) of/.exec(f.hud.objective)![1]);
      if (seen[seen.length - 1] !== n) seen.push(n);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('AC2: rebinding shoot changes the prompt', () => {
    const { flow, store, frames } = setup(true);
    flow.send({ type: 'openTutorial' });
    flow.frame(FRAME_MS);
    expect(frames[frames.length - 1]!.prompt.headline).toContain('W/A/S/D');

    runUntil(flow, () => stepIndex(flow) === 5);
    flow.frame(FRAME_MS);
    expect(frames[frames.length - 1]!.prompt.headline).toContain('Space');

    const mapper = createInputMapper({ schedule: createFakeScheduler().schedule });
    const controls = createControlSettings({ store, input: mapper });
    controls.beginRebind(
      store.get('bindings').findIndex((b) => b.input === 'Space' && b.action === 'shoot'),
    );
    mapper.press('KeyF');
    flow.frame(FRAME_MS);
    const headline = frames[frames.length - 1]!.prompt.headline;
    expect(stepIndex(flow)).toBe(5);
    expect(headline).toContain('F');
    expect(headline).not.toContain('Space');
  });

  it.each(TUTORIAL_STEPS.map((s, i) => [s.id, i] as const))(
    'AC3: exits to the main menu from step %s',
    (_id, index) => {
      for (const how of ['pause', 'back'] as const) {
        const { flow, counts } = setup(true);
        flow.send({ type: 'openTutorial' });
        runUntil(flow, () => stepIndex(flow) === index);
        if (how === 'pause') flow.handleAction('pause');
        else flow.send({ type: 'back' });
        expect(flow.state()).toEqual({ screen: 'mainMenu' });
        expect(flow.tutorial()).toBeNull();
        expect(counts.clear).toBe(1);
      }
    },
  );

  it('AC3: finishing every step returns to the main menu on its own', () => {
    const { flow, counts } = setup(true);
    flow.send({ type: 'openTutorial' });
    runUntil(flow, () => flow.state().screen === 'mainMenu');
    expect(flow.tutorial()).toBeNull();
    expect(counts.clear).toBe(1);
  });

  it('AC4: completing and exiting leave the progress and the stored save unchanged', () => {
    const { flow, store, storage } = setup(true);
    const progress = structuredClone(store.get('progress'));
    const raw = new Map(storage.data);

    flow.send({ type: 'openTutorial' });
    runUntil(flow, () => stepIndex(flow) === 3);
    flow.handleAction('pause');
    flow.send({ type: 'openTutorial' });
    runUntil(flow, () => flow.state().screen === 'mainMenu');

    expect(store.get('progress')).toEqual(progress);
    expect(storage.data).toEqual(raw);
  });

  it('forwards presses to onPress while in the tutorial', () => {
    const { flow, presses } = setup(false);
    flow.handleAction('shoot');
    expect(presses).toEqual([]);
    flow.send({ type: 'openTutorial' });
    flow.handleAction('shoot');
    expect(presses).toEqual(['shoot']);
  });
});
