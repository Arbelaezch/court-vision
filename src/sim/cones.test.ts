import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from './index';
import type {
  CourtPoint,
  DefenseMode,
  GameEvent,
  GameState,
  PassType,
  PlayerState,
  SimAction,
} from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_PASSING } from './testPassing';
import { TEST_SHOOTING } from './testShooting';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const PASSER_SPOT: CourtPoint = { x: 0, z: 2 };
const RECEIVER_SPOT: CourtPoint = { x: 0, z: -4 };
// Off the 0 -> 1 path and far from the receiver, for ids 2..9 (as in ./passing.test.ts).
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
function game(
  seed: number,
  placed: Record<number, CourtPoint>,
  defenseMode: DefenseMode,
): GameState {
  const state = structuredClone(
    createGame({
      seed,
      movement: TEST_MOVEMENT,
      passing: TEST_PASSING,
      shooting: TEST_SHOOTING,
      defenseMode,
    }),
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
): { state: GameState; events: GameEvent[] } {
  let s = stepGame(state, actions);
  const events = [...s.events];
  for (let t = 1; t < maxTicks && s.ball.kind === 'inFlight'; t++) {
    s = stepGame(s, []);
    events.push(...s.events);
  }
  return { state: s, events };
}

function heldBy(state: GameState): number | null {
  return state.ball.kind === 'held' ? state.ball.holderId : null;
}

type ShotEvent = Extract<GameEvent, { type: 'shotResolved' }>;

function shotEvent(events: readonly GameEvent[]): ShotEvent {
  const shot = events.find((e): e is ShotEvent => e.type === 'shotResolved');
  if (shot === undefined) {
    throw new Error('no shotResolved event');
  }
  return shot;
}

describe('cone defense mode: passes', () => {
  it.each(SEEDS)('a cone in the lane does not intercept a chest pass (seed %i)', (seed) => {
    const placed = { 6: { x: 0, z: -1 } };

    const live = runUntilSettled(game(seed, placed, 'live'), [pass('chestPass')]);
    expect(live.events).toEqual([expect.objectContaining({ type: 'mistake', kind: 'turnover' })]);
    expect(heldBy(live.state)).toBe(6);

    const cones = runUntilSettled(game(seed, placed, 'cones'), [pass('chestPass')]);
    expect(cones.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passerId: 0, receiverId: 1 }),
    ]);
    expect(heldBy(cones.state)).toBe(1);
  });

  it.each(SEEDS)('a cone covering the receiver does not take the catch (seed %i)', (seed) => {
    const placed = { 6: { x: 0, z: -4.2 } };

    const live = runUntilSettled(game(seed, placed, 'live'), [pass('chestPass')]);
    expect(live.events).toEqual([expect.objectContaining({ type: 'mistake', kind: 'turnover' })]);
    expect(heldBy(live.state)).toBe(6);

    const cones = runUntilSettled(game(seed, placed, 'cones'), [pass('chestPass')]);
    expect(cones.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passerId: 0, receiverId: 1 }),
    ]);
    expect(heldBy(cones.state)).toBe(1);
  });
});

describe('cone defense mode: shots', () => {
  const shooter = { x: 0, z: -1 };
  const defender = { x: 0, z: -1.4 };
  const farAway = { x: 7, z: 6.5 };

  it.each(SEEDS)('a cone in arm reach neither blocks nor contests (seed %i)', (seed) => {
    const live = stepGame(game(seed, { 0: shooter, 5: defender }, 'live'), [{ type: 'shoot' }]);
    expect(shotEvent(live.events).blockerId).toBe(5);

    const cones = stepGame(game(seed, { 0: shooter, 5: defender }, 'cones'), [{ type: 'shoot' }]);
    const coneShot = shotEvent(cones.events);
    expect(coneShot.blockerId).toBeNull();
    expect(cones.events.some((e) => e.type === 'mistake')).toBe(false);

    const open = stepGame(game(seed, { 0: shooter, 5: farAway }, 'live'), [{ type: 'shoot' }]);
    const openShot = shotEvent(open.events);
    expect(openShot.blockerId).toBeNull();
    expect(coneShot.look).toBe(openShot.look);
    expect(coneShot.makeChance).toBe(openShot.makeChance);
  });
});

describe('createGame defenseMode', () => {
  it("defaults to 'live' and keeps 'cones'", () => {
    expect(createGame({ seed: 1, movement: TEST_MOVEMENT }).defenseMode).toBe('live');
    expect(createGame({ seed: 1, movement: TEST_MOVEMENT, defenseMode: 'cones' }).defenseMode).toBe(
      'cones',
    );
  });

  it('throws for an unknown defense mode', () => {
    expect(() =>
      createGame({
        seed: 1,
        movement: TEST_MOVEMENT,
        defenseMode: 'zone' as unknown as DefenseMode,
      }),
    ).toThrow('Court Vision: defenseMode must be one of live, cones, got zone');
  });

  it('keeps cones in the state as defense players', () => {
    const state = createGame({ seed: 1, movement: TEST_MOVEMENT, defenseMode: 'cones' });
    const defense = state.players.filter((p: PlayerState) => p.side === 'defense');
    expect(defense).toHaveLength(5);
  });
});
