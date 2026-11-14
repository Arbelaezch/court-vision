import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type ModeConfig,
  type PlayScenario,
} from '../content';
import type { RunControllerState } from '../ai';
import type { CourtPoint, GameState, RoleId, SimAction } from '../sim';
import { createRunSession, type RunSession } from './runSession';
import { createFakeStorage, type FakeStorage } from './storage/fakeStorage';
import { SAVE_STORAGE_KEY, createSaveStore } from './storage';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE_TEST: ModeConfig = {
  ...PRACTICE,
  id: 'scrimmageTest',
  rules: 'scrimmage',
  cueLevel: 'reduced',
  defense: 'cones',
};
const CUT_SPOT = { x: 0.8, z: -4 };

function open(fake: FakeStorage, warnings: string[]) {
  return createSaveStore({ storage: fake, warn: (m) => warnings.push(m) });
}

function setup(mode: ModeConfig = PRACTICE, extra: { coverageId?: string } = {}) {
  const fake = createFakeStorage({});
  const warnings: string[] = [];
  const store = open(fake, warnings);
  const session = createRunSession(GIVE_AND_GO, mode, { seed: 1, ...SETUPS, ...extra, store });
  return { fake, warnings, store, session };
}

function offense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`no offense ${role}`);
  return player;
}

function passTo(game: GameState, role: RoleId): SimAction {
  return { type: 'pass', passType: 'chestPass', targetId: offense(game, role).id };
}

function moveToward(game: GameState, spot: CourtPoint): SimAction {
  const me = game.players.find((p) => p.id === game.controlledPlayerId);
  if (me === undefined) throw new Error('no controlled player');
  const dx = spot.x - me.pos.x;
  const dz = spot.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return { type: 'move', x: 0, z: 0 };
  const scale = Math.max(d, 1);
  return { type: 'move', x: dx / scale, z: dz / scale };
}

function advance(
  session: RunSession,
  maxTicks: number,
  actionsFor: (c: RunControllerState) => SimAction[],
  stop: (c: RunControllerState) => boolean,
) {
  for (let i = 0; i < maxTicks; i += 1) {
    session.step(actionsFor(session.state()));
    if (stop(session.state())) break;
  }
}

/** Entry pass, then the PG walks to the cut spot until the phase is 'finish'. */
function toFinish(session: RunSession) {
  session.step([passTo(session.state().game, 'SG')]);
  advance(
    session,
    120,
    () => [],
    (c) => c.run.phaseId === 'cut',
  );
  advance(
    session,
    1200,
    (c) => [moveToward(c.game, CUT_SPOT)],
    (c) => c.run.phaseId === 'finish',
  );
  expect(session.state().run.phaseId).toBe('finish');
  expect(session.state().status).toBe('playing');
}

describe('run session progress', () => {
  it('a Practice success increments attempts and successes, and persists', () => {
    const { fake, store, session } = setup();
    toFinish(session);
    const shot = session.step([{ type: 'shoot' }]);
    expect(shot.attempt?.success).toBe(true);
    expect(store.get('progress').plays.giveAndGo?.practice).toEqual({ attempts: 1, successes: 1 });

    const warnings: string[] = [];
    const reopened = open(fake, warnings);
    expect(reopened.get('progress').plays.giveAndGo?.practice).toEqual({
      attempts: 1,
      successes: 1,
    });
    expect(warnings).toEqual([]);
  });

  it('a mistake increments attempts only, run after run', () => {
    const { store, session } = setup();
    session.step([passTo(session.state().game, 'SF')]);
    expect(store.get('progress').plays.giveAndGo?.practice).toEqual({ attempts: 1, successes: 0 });
    session.step([]); // instant reset
    session.step([passTo(session.state().game, 'SF')]);
    expect(store.get('progress').plays.giveAndGo?.practice).toEqual({ attempts: 2, successes: 0 });
  });

  it('an unsuccessful run counts as an attempt under its mode key', () => {
    const { store, session } = setup(SCRIMMAGE_TEST, { coverageId: 'helpOnCut' });
    toFinish(session);
    const shot = session.step([{ type: 'shoot' }]);
    expect(shot.attempt?.outcome.kind).toBe('unsuccessful');
    expect(store.get('progress').plays.giveAndGo?.scrimmageTest).toEqual({
      attempts: 1,
      successes: 0,
    });
  });

  it('quit and restart leave counters unchanged', () => {
    const { fake, store, session } = setup();
    const before = fake.data.get(SAVE_STORAGE_KEY);
    session.step([{ type: 'move', x: 0, z: 1 }]);
    session.restart();
    session.step([{ type: 'move', x: 0, z: 1 }]);
    session.quit();
    expect(store.get('progress')).toEqual({ plays: {} });
    expect(fake.data.get(SAVE_STORAGE_KEY)).toBe(before);
  });

  it('restart during the result hold keeps the recorded success', () => {
    const { store, session } = setup();
    toFinish(session);
    session.step([{ type: 'shoot' }]);
    expect(session.state().status).toBe('showingResult');
    session.restart();
    expect(session.state().status).toBe('playing');
    expect(store.get('progress').plays.giveAndGo?.practice).toEqual({ attempts: 1, successes: 1 });
  });

  it('an unknown mode id records under that id and survives a reload', () => {
    const drill: ModeConfig = { ...PRACTICE, id: 'drill', cueLevel: 'none' };
    const { fake, store, session } = setup(drill);
    session.step([passTo(session.state().game, 'SF')]);
    expect(store.get('progress').plays.giveAndGo?.drill).toEqual({ attempts: 1, successes: 0 });
    const warnings: string[] = [];
    const reopened = open(fake, warnings);
    expect(reopened.get('progress').plays.giveAndGo?.drill).toEqual({
      attempts: 1,
      successes: 0,
    });
    expect(warnings).toEqual([]);
  });
});

describe('run session clock', () => {
  it('uses the mode speed multiplier', () => {
    const { session } = setup({ ...PRACTICE, speedMultiplier: 0.85 });
    expect(session.clock.stepper.speed).toBe(0.85);
  });

  it('frame runs sim steps and returns [] while paused', () => {
    const { session } = setup();
    // Frame deltas clamp at MAX_FRAME_DELTA_MS (250), so one second is four frames.
    let total = 0;
    for (let i = 0; i < 4; i += 1) total += session.frame(250, () => []).length;
    expect(total).toBe(60);
    session.clock.pause('player');
    expect(session.frame(1000, () => [])).toEqual([]);
  });

  it('calls onPause with the reason', () => {
    const fake = createFakeStorage({});
    const reasons: string[] = [];
    const session = createRunSession(GIVE_AND_GO, PRACTICE, {
      seed: 1,
      ...SETUPS,
      store: open(fake, []),
      onPause: (r) => reasons.push(r),
    });
    session.clock.pause('hidden');
    expect(reasons).toEqual(['hidden']);
  });
});
