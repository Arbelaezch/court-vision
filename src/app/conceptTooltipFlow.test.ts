import { describe, expect, it } from 'vitest';
import type { RunControllerState } from '../ai';
import { loadAppContent } from './boot';
import { createAppFlow } from './appFlow';
import type { RunFrame } from './runFrame';
import { createSaveStore } from './storage';
import { createFakeStorage } from './storage/fakeStorage';

describe('concept tooltips in the app flow', () => {
  it('shows tooltips without pausing or blocking the run, and only the first time', () => {
    const drawn: { controller: RunControllerState; frame: RunFrame }[] = [];
    const store = createSaveStore({ storage: createFakeStorage(), warn: () => {} });
    const flow = createAppFlow({
      content: loadAppContent(),
      store,
      renderer: {
        drawRun: (controller, frame) => drawn.push({ controller, frame }),
        clear: () => {},
      },
      seed: () => 1,
    });
    flow.send({ type: 'openPractice' });
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    const ticks: number[] = [];
    for (let i = 0; i < 5; i++) {
      flow.frame(16);
      const last = drawn[drawn.length - 1]!;
      ticks.push(last.controller.game.tick);
      expect(flow.state().screen).toBe('inRun');
    }
    expect(drawn.some((d) => d.frame.tooltips.some((t) => t.term === 'Positions'))).toBe(true);
    expect(ticks[4]!).toBeGreaterThan(ticks[0]!);

    flow.send({ type: 'pause' });
    flow.send({ type: 'quit' });
    flow.send({ type: 'openPractice' });
    drawn.length = 0;
    flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
    for (let i = 0; i < 5; i++) flow.frame(16);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.some((d) => d.frame.tooltips.some((t) => t.id === 'positions'))).toBe(false);
  });
});
