import { describe, expect, it } from 'vitest';
import {
  PASS_TURNOVER_REASONS,
  PASS_TYPES,
  createGame,
  passHeightAt,
  runHeadless,
  stepGame,
} from './index';
import type {
  CourtPoint,
  GameEvent,
  GameState,
  PassType,
  PassingSetup,
  PlayerState,
  SimAction,
} from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_PASSING } from './testPassing';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
// Pass types that work at the 6 m test distance (a hand-off is limited to short range).
const FLIGHT_PASSES = PASS_TYPES.filter((t) => t !== 'handOff');
const PASSER_SPOT: CourtPoint = { x: 0, z: 2 };
const RECEIVER_SPOT: CourtPoint = { x: 0, z: -4 };
// Off the 0 -> 1 path and far from the receiver, for ids 2..9.
const PARKING: readonly CourtPoint[] = [
  { x: -7, z: 6 },
  { x: -5.5, z: 6 },
  { x: -4, z: 6 },
  { x: 4, z: 6 },
  { x: 5.5, z: 6 },
  { x: 7, z: 6 },
  { x: -7, z: 4.5 },
  { x: 7, z: 4.5 },
];

function player(state: GameState, id: number): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

function defaultSpot(id: number): CourtPoint {
  if (id === 0) {
    return PASSER_SPOT;
  }
  if (id === 1) {
    return RECEIVER_SPOT;
  }
  return PARKING[id - 2]!;
}

/** Passer 0 and receiver 1 on the z axis; everyone else parked; `placed` overrides positions. */
function game(seed = 1, placed: Record<number, CourtPoint> = {}): GameState {
  const state = structuredClone(
    createGame({ seed, movement: TEST_MOVEMENT, passing: TEST_PASSING }),
  );
  for (const p of state.players) {
    p.pos = { ...(placed[p.id] ?? defaultSpot(p.id)) };
  }
  return state;
}

function pass(passType: PassType, targetId = 1): SimAction {
  return { type: 'pass', passType, targetId };
}

/** Applies `actions` on the first step, then steps until the ball is held again. */
function runUntilSettled(
  state: GameState,
  actions: readonly SimAction[],
  maxTicks = 180,
): { state: GameState; events: GameEvent[]; ballY: number[] } {
  let s = stepGame(state, actions);
  const events = [...s.events];
  const ballY: number[] = [];
  for (let t = 1; t < maxTicks && s.ball.kind === 'inFlight'; t++) {
    ballY.push(s.ball.pos.y);
    s = stepGame(s, []);
    events.push(...s.events);
  }
  return { state: s, events, ballY };
}

function heldBy(state: GameState): number | null {
  return state.ball.kind === 'held' ? state.ball.holderId : null;
}

describe('passes through a lane', () => {
  it.each(SEEDS)('chest is intercepted where bounce completes (seed %i)', (seed) => {
    const start = game(seed, { 6: { x: 0, z: -1 } });

    const chest = runUntilSettled(start, [pass('chestPass')]);
    expect(chest.events).toEqual([
      expect.objectContaining({
        type: 'mistake',
        kind: 'turnover',
        reason: 'Passed into a crowded lane',
      }),
    ]);
    expect(heldBy(chest.state)).toBe(6);
    expect(chest.state.lastCatch).toBeNull();

    const bounce = runUntilSettled(start, [pass('bouncePass')]);
    expect(bounce.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', receiverId: 1 }),
    ]);
    expect(heldBy(bounce.state)).toBe(1);
  });

  it.each(SEEDS)('a lob clears the lane but not a covered receiver (seed %i)', (seed) => {
    const over = runUntilSettled(game(seed, { 6: { x: 0, z: -1 } }), [pass('lob')]);
    expect(over.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passType: 'lob', receiverId: 1 }),
    ]);
    expect(heldBy(over.state)).toBe(1);

    const covered = runUntilSettled(game(seed, { 6: { x: 0.5, z: -4 } }), [pass('lob')]);
    expect(covered.events).toEqual([
      expect.objectContaining({
        type: 'mistake',
        kind: 'turnover',
        reason: PASS_TURNOVER_REASONS.coveredLob,
      }),
    ]);
    expect(covered.events[0]).toMatchObject({ reason: 'Lobbed to a covered teammate' });
    expect(heldBy(covered.state)).toBe(6);
  });

  it('a chest pass to a covered receiver is a covered-teammate turnover', () => {
    // Behind the receiver: close enough to contest the catch, too far from the lane to matter.
    const start = game(1, { 6: { x: 0, z: -4.2 } });
    const { events, state } = runUntilSettled(start, [pass('chestPass')]);
    expect(events).toEqual([
      expect.objectContaining({ reason: PASS_TURNOVER_REASONS.coveredReceiver }),
    ]);
    expect(heldBy(state)).toBe(6);
  });

  it.each(SEEDS)('a defender just behind the passer does not intercept (seed %i)', (seed) => {
    for (const z of [2.3, 2.5]) {
      const { events, state } = runUntilSettled(game(seed, { 6: { x: 0, z } }), [
        pass('chestPass'),
      ]);
      expect(events).toEqual([expect.objectContaining({ type: 'passCompleted', receiverId: 1 })]);
      expect(heldBy(state)).toBe(1);
    }
  });

  it('the earliest intercepting defender on the path takes the ball', () => {
    const start = game(1, { 6: { x: 0, z: -2 }, 7: { x: 0, z: 0 } });
    const { state } = runUntilSettled(start, [pass('chestPass')]);
    expect(heldBy(state)).toBe(7);
  });
});

describe('completed passes', () => {
  it.each(FLIGHT_PASSES)('%s to a standing receiver is caught set', (passType) => {
    const { events, state } = runUntilSettled(game(), [pass(passType)]);
    expect(events).toEqual([
      {
        type: 'passCompleted',
        tick: state.tick,
        passType,
        passerId: 0,
        receiverId: 1,
        receiverSet: true,
      },
    ]);
    expect(state.lastCatch).toEqual({ playerId: 1, passType, tick: state.tick, set: true });
  });

  it('a moving receiver is caught not set', () => {
    const start = game(1, { 1: { x: -3, z: -4 } });
    player(start, 1).moveIntent = { x: 1, z: 0 };
    const { events, state } = runUntilSettled(start, [pass('chestPass')]);
    expect(events).toEqual([
      expect.objectContaining({ type: 'passCompleted', receiverId: 1, receiverSet: false }),
    ]);
    expect(state.lastCatch).toEqual({
      playerId: 1,
      passType: 'chestPass',
      tick: state.tick,
      set: false,
    });
    expect(heldBy(state)).toBe(1);
  });

  /** Receiver 1 already running +x at full speed from (-3, -4). */
  function cutting(seed: number, placed: Record<number, CourtPoint> = {}): GameState {
    const start = game(seed, { 1: { x: -3, z: -4 }, ...placed });
    player(start, 1).moveIntent = { x: 1, z: 0 };
    player(start, 1).vel = { x: TEST_MOVEMENT.profiles.SG.speedMps, z: 0 };
    return start;
  }

  it.each(SEEDS)('a lob to a cutter is judged where the cutter catches it (seed %i)', (seed) => {
    // A defender left at the cutter's start spot does not cover the catch.
    const left = runUntilSettled(cutting(seed, { 6: { x: -3, z: -4 } }), [pass('lob')]);
    expect(left.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passType: 'lob', receiverId: 1 }),
    ]);
    expect(heldBy(left.state)).toBe(1);

    // A defender standing where the cutter ends up does.
    const catchSpot = player(left.state, 1).pos;
    expect(catchSpot.x).toBeGreaterThan(0);
    const covered = runUntilSettled(cutting(seed, { 6: { ...catchSpot } }), [pass('lob')]);
    expect(covered.events).toEqual([
      expect.objectContaining({ kind: 'turnover', reason: PASS_TURNOVER_REASONS.coveredLob }),
    ]);
    expect(heldBy(covered.state)).toBe(6);
  });

  it.each(SEEDS)('a chest pass leads a cutter past the stale lane (seed %i)', (seed) => {
    // On the line to the cutter's start spot, well off the line to where they will be.
    const { events, state } = runUntilSettled(cutting(seed, { 6: { x: -1.5, z: -1 } }), [
      pass('chestPass'),
    ]);
    expect(events).toEqual([expect.objectContaining({ type: 'passCompleted', receiverId: 1 })]);
    expect(heldBy(state)).toBe(1);
  });

  it('the release step puts the ball in flight from the passer to the target', () => {
    for (const passType of FLIGHT_PASSES) {
      const next = stepGame(game(), [pass(passType)]);
      expect(next.ball).toMatchObject({ kind: 'inFlight', fromId: 0, targetId: 1, passType });
      expect(next.events).toEqual([]);
    }
  });

  it('the ball follows the receiver and reaches them at the catch', () => {
    const start = game(1, { 1: { x: -3, z: -4 } });
    player(start, 1).moveIntent = { x: 1, z: 0 };
    let s = stepGame(start, [pass('lob')]);
    while (s.ball.kind === 'inFlight' && s.ball.elapsedTicks < s.ball.flightTicks - 1) {
      s = stepGame(s, []);
    }
    expect(s.ball.kind).toBe('inFlight');
    const last = stepGame(s, []);
    expect(heldBy(last)).toBe(1);
    expect(last.players[1]!.pos.x).toBeGreaterThan(-3);
  });
});

describe('pass arcs and speeds', () => {
  function flightTicks(passType: PassType): number {
    const next = stepGame(game(), [pass(passType)]);
    if (next.ball.kind !== 'inFlight') {
      throw new Error('ball not in flight');
    }
    return next.ball.flightTicks;
  }

  it('over the same distance: chest faster than bounce, bounce faster than lob', () => {
    expect(flightTicks('chestPass')).toBeLessThan(flightTicks('bouncePass'));
    expect(flightTicks('bouncePass')).toBeLessThan(flightTicks('lob'));
  });

  it('a bounce pass touches the floor and a lob arcs above a chest pass', () => {
    const bounce = runUntilSettled(game(), [pass('bouncePass')]).ballY;
    const lob = runUntilSettled(game(), [pass('lob')]).ballY;
    const chest = runUntilSettled(game(), [pass('chestPass')]).ballY;
    expect(Math.min(...bounce)).toBeLessThan(0.05);
    expect(Math.min(...bounce)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...lob)).toBeGreaterThan(3.5);
    expect(Math.max(...lob)).toBeGreaterThan(Math.max(...chest));
  });

  it.each(PASS_TYPES)('passHeightAt(%s) runs from release to catch height', (passType) => {
    const flight = TEST_PASSING.tuning[passType];
    expect(passHeightAt(passType, 0, TEST_PASSING.tuning)).toBeCloseTo(flight.releaseHeightM);
    expect(passHeightAt(passType, 1, TEST_PASSING.tuning)).toBeCloseTo(flight.catchHeightM);
    expect(passHeightAt(passType, -1, TEST_PASSING.tuning)).toBeCloseTo(flight.releaseHeightM);
    expect(passHeightAt(passType, 2, TEST_PASSING.tuning)).toBeCloseTo(flight.catchHeightM);
  });

  it('a lob peaks at its apex height at mid-flight', () => {
    expect(passHeightAt('lob', 0.5, TEST_PASSING.tuning)).toBeCloseTo(
      TEST_PASSING.tuning.lob.apexHeightM,
    );
  });
});

describe('hand-offs', () => {
  it('a hand-off to a teammate 1 m away completes', () => {
    const { events, state } = runUntilSettled(game(1, { 1: { x: 0, z: 1 } }), [pass('handOff')]);
    expect(events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passType: 'handOff', receiverId: 1 }),
    ]);
    expect(heldBy(state)).toBe(1);
  });

  it('a hand-off to a teammate 3 m away is ignored', () => {
    const next = stepGame(game(1, { 1: { x: 0, z: -1 } }), [pass('handOff')]);
    expect(next.ball).toEqual({ kind: 'held', holderId: 0 });
    expect(next.events).toEqual([]);
  });
});

describe('pass while not holding the ball', () => {
  it('is ignored while the ball is in flight', () => {
    const inFlight = stepGame(game(), [pass('lob')]);
    expect(stepGame(inFlight, [pass('chestPass', 2)]).ball).toEqual(stepGame(inFlight, []).ball);
  });

  it('is ignored while a teammate holds the ball', () => {
    const start = game();
    start.ball = { kind: 'held', holderId: 1 };
    const next = stepGame(start, [pass('chestPass', 2)]);
    expect(next.ball).toEqual({ kind: 'held', holderId: 1 });
    expect(next.events).toEqual([]);
  });
});

describe('invalid passes', () => {
  it.each([0, 6, 99, 1.5])('targetId %s throws', (targetId) => {
    expect(() => stepGame(game(), [pass('chestPass', targetId)])).toThrow(/Court Vision/);
  });

  it('an unknown pass type throws', () => {
    const action = { type: 'pass', passType: 'alleyOop', targetId: 1 } as unknown as SimAction;
    expect(() => stepGame(game(), [action])).toThrow(/Court Vision/);
  });

  it('a pass on a game created without passing throws', () => {
    const state = createGame({ seed: 1, movement: TEST_MOVEMENT });
    expect(state.passing).toBeNull();
    expect(() => stepGame(state, [pass('chestPass')])).toThrow(/Court Vision/);
  });

  function withSetup(change: (setup: PassingSetup) => void): PassingSetup {
    const setup = structuredClone(TEST_PASSING);
    change(setup);
    return setup;
  }

  it.each([
    ['a rating of 101', withSetup((s) => (s.profiles.SF.passing = 101))],
    ['a missing role profile', withSetup((s) => Reflect.deleteProperty(s.profiles, 'PF'))],
    ['a lob apex below its release height', withSetup((s) => (s.tuning.lob.apexHeightM = 2))],
    ['a negative reach', withSetup((s) => (s.profiles.C.reachM = -1))],
    ['a bounce fraction of 1', withSetup((s) => (s.tuning.bouncePass.bounceAtFraction = 1))],
    ['a zero intercept threshold', withSetup((s) => (s.tuning.interceptThreshold = 0))],
    ['a NaN speed', withSetup((s) => (s.tuning.chestPass.speedMps = Number.NaN))],
  ])('createGame rejects %s', (_label, passing) => {
    expect(() => createGame({ seed: 1, movement: TEST_MOVEMENT, passing })).toThrow(/Court Vision/);
  });
});

describe('purity and determinism', () => {
  it('createGame copies the passing setup', () => {
    const passing = structuredClone(TEST_PASSING);
    const state = createGame({ seed: 1, movement: TEST_MOVEMENT, passing });
    passing.tuning.jitter = 0.3;
    expect(state.passing).toEqual(TEST_PASSING);
    expect(state.lastCatch).toBeNull();
  });

  it('stepGame with a pass action does not mutate its input', () => {
    const state = game(3, { 6: { x: 0, z: -1 } });
    const before = structuredClone(state);
    stepGame(state, [pass('chestPass')]);
    expect(state).toEqual(before);
  });

  it('runHeadless with the same seed, inputs and setup gives identical results', () => {
    // Placeholder spots: the PG's defender stands about 0.83 m from the PG -> SG lane, a weak
    // threat that draws from the RNG without intercepting.
    const options = {
      seed: 7,
      ticks: 120,
      inputs: [{ tick: 0, action: pass('chestPass') }],
      movement: TEST_MOVEMENT,
      passing: TEST_PASSING,
    };
    const first = runHeadless(options);
    const second = runHeadless(options);
    expect(first).toStrictEqual(second);
    expect(heldBy(first)).toBe(1);
    const noPass = runHeadless({ ...options, inputs: [] });
    expect(first.rng).not.toEqual(noPass.rng);
  });
});
