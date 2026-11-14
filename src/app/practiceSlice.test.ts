// Headless integration: appFlow + humanInput drive full Give-and-Go runs in Practice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunControllerState } from '../ai';
import type { GameEvent } from '../sim';
import { loadAppContent } from './boot';
import { createAppFlow } from './appFlow';
import { createHumanInput } from './humanInput';
import type { RunFrame } from './runFrame';
import { createSaveStore } from './storage';
import { createFakeStorage } from './storage/fakeStorage';

const CONTENT = loadAppContent();
const CUT_SPOT = { x: 0.8, z: -4 };
const FRAME_MS = 1000 / 60;
const STEP_CAP = 3000;

type Kind = 'success' | 'wrong';

function setup() {
  const events: GameEvent[] = [];
  const draws: { controller: RunControllerState; frame: RunFrame }[] = [];
  const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
  const flowRef: { current: ReturnType<typeof createAppFlow> | null } = { current: null };
  const state = () => {
    const s = flowRef.current?.session();
    if (!s) throw new Error('no session');
    return s.state();
  };
  const human = createHumanInput({
    held: () => {
      const c = state();
      const me = c.game.players.find((p) => p.id === c.game.controlledPlayerId);
      if (!me || c.run.phaseId === 'entry')
        return { axes: { x: 0, y: 0 }, sprint: false, pivot: false };
      const dx = CUT_SPOT.x - me.pos.x;
      const dz = CUT_SPOT.z - me.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) return { axes: { x: 0, y: 0 }, sprint: false, pivot: false };
      const scale = Math.max(d, 1);
      return { axes: { x: dx / scale, y: -dz / scale }, sprint: false, pivot: false };
    },
    aimAt: () => null,
    targeting: () => ({ mode: 'both', aimSensitivity: 1 }),
  });
  const flow = createAppFlow({
    content: CONTENT,
    store,
    renderer: {
      drawRun: (controller, frame) => draws.push({ controller, frame }),
      clear: () => {},
    },
    seed: () => 7,
    actionsFor: human.actionsFor,
    eventSinks: [(e) => events.push(e)],
    onPress: human.press,
  });
  flowRef.current = flow;
  flow.send({ type: 'openPractice' });
  flow.send({ type: 'selectPlay', playId: 'giveAndGo' });
  return { flow, store, events, draws, state };
}

function progress(store: ReturnType<typeof setup>['store']) {
  return store.get('progress').plays.giveAndGo?.practice ?? { attempts: 0, successes: 0 };
}

/** Plays one run of `kind` to its terminal outcome and through the following reset. */
function playOne(ctx: ReturnType<typeof setup>, kind: Kind): void {
  const { flow, state } = ctx;
  const startRun = state().runIndex;
  const pressedAt = new Set<string>();
  const pressOnce = (key: string, ...actions: Parameters<typeof flow.handleAction>[0][]) => {
    if (pressedAt.has(key)) return;
    pressedAt.add(key);
    for (const a of actions) flow.handleAction(a);
  };
  for (let i = 0; i < STEP_CAP; i++) {
    const c = state();
    if (c.runIndex > startRun) {
      // One frame so the human input sees the new run and drops stale state before the next presses.
      flow.frame(FRAME_MS);
      return;
    }
    if (c.status === 'playing') {
      if (c.run.phaseId === 'entry') {
        if (kind === 'success') pressOnce('entry', 'passTarget1', 'chestPass');
        else pressOnce('entry', 'passTarget2', 'chestPass');
      } else if (c.run.phaseId === 'finish') {
        pressOnce('finish', 'shoot');
      }
    }
    flow.frame(FRAME_MS);
  }
  throw new Error(`run did not finish within ${STEP_CAP} frames (${kind})`);
}

function expectAtSetup(c: RunControllerState) {
  expect(c.status).toBe('playing');
  expect(c.run.phaseId).toBe('entry');
  const pg = c.game.players.find((p) => p.side === 'offense' && p.role === 'PG');
  expect(c.game.ball).toEqual({ kind: 'held', holderId: pg?.id });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Practice slice: Give-and-Go end to end', () => {
  it('(a) success path records a success, shows a banner and resets', () => {
    const ctx = setup();
    playOne(ctx, 'success');
    expect(ctx.events.some((e) => e.type === 'runSuccess')).toBe(true);
    expect(ctx.draws.some((d) => d.frame.hud.banner?.tone === 'success')).toBe(true);
    expect(ctx.draws.some((d) => d.frame.steps.some((s) => s.reset))).toBe(true);
    expectAtSetup(ctx.state());
    expect(progress(ctx.store)).toEqual({ attempts: 1, successes: 1 });
  });

  it('(b) wrong teammate whistles, resets at once and shows no banner', () => {
    const ctx = setup();
    playOne(ctx, 'wrong');
    expect(ctx.events.some((e) => e.type === 'mistake' && e.kind === 'wrongTeammate')).toBe(true);
    expect(ctx.draws.every((d) => d.frame.hud.banner === null)).toBe(true);
    const steps = ctx.draws.flatMap((d) => d.frame.steps);
    const mistakeAt = steps.findIndex((s) => s.events.some((e) => e.type === 'mistake'));
    expect(mistakeAt).toBeGreaterThanOrEqual(0);
    expect(steps[mistakeAt + 1]?.reset).toBe(true);
    expect(ctx.draws.every((d) => d.controller.status !== 'showingResult')).toBe(true);
    expectAtSetup(ctx.state());
    expect(progress(ctx.store)).toEqual({ attempts: 1, successes: 0 });
  });

  it('(c) ten runs in a row without console errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = setup();
    const kinds: Kind[] = [];
    for (let i = 0; i < 10; i++) kinds.push(i % 2 === 0 ? 'success' : 'wrong');
    for (const kind of kinds) playOne(ctx, kind);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(progress(ctx.store)).toEqual({ attempts: 10, successes: 5 });
  });
});
