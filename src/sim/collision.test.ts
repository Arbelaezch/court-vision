import { describe, expect, it } from 'vitest';
import { SIDELINE_X, createGame, resolveBodyCollisions, stepGame } from './index';
import type {
  CollisionSetup,
  CourtPoint,
  DefenseMode,
  GameState,
  MovementSetup,
  PlayerCommand,
  PlayerState,
} from './index';
import { TEST_MOVEMENT } from './testMovement';

// Test fixture, not tuning.
const COLLISION: CollisionSetup = {
  profiles: {
    PG: { radiusM: 0.25, mass: 1.0 },
    SG: { radiusM: 0.25, mass: 1.0 },
    SF: { radiusM: 0.27, mass: 1.2 },
    PF: { radiusM: 0.29, mass: 1.5 },
    C: { radiusM: 0.29, mass: 1.5 },
  },
  tuning: { setSpeedMps: 0.3, setMassMultiplier: 20, iterations: 4 },
};

const MOVEMENT: MovementSetup = { ...TEST_MOVEMENT, collision: COLLISION };

const OFFENSE_PG = 0;
const OFFENSE_C = 4;
const DEFENSE_PG = 5;
const DEFENSE_SG = 6;

function byId(state: GameState, id: number): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

function radius(state: GameState, p: PlayerState): number {
  return state.collision!.profiles[p.role].radiusM;
}

/** A game with every player parked far apart along z = -5, so only the players a test moves meet. */
function game(defenseMode: DefenseMode = 'live', movement: MovementSetup = MOVEMENT): GameState {
  const state = structuredClone(createGame({ seed: 1, movement, defenseMode }));
  state.players.forEach((p, i) => {
    p.pos = { x: -6.75 + i * 1.5, z: -5 };
  });
  return state;
}

function place(state: GameState, id: number, pos: CourtPoint, vel: CourtPoint = { x: 0, z: 0 }) {
  const p = byId(state, id);
  p.pos = { ...pos };
  p.vel = { ...vel };
}

function maxPenetration(state: GameState): number {
  let worst = 0;
  const { players } = state;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      worst = Math.max(worst, radius(state, a) + radius(state, b) - d);
    }
  }
  return worst;
}

function steerToward(state: GameState, id: number, target: CourtPoint): PlayerCommand {
  const p = byId(state, id);
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) {
    return { type: 'steer', playerId: id, x: 0, z: 0 };
  }
  return { type: 'steer', playerId: id, x: dx / len, z: dz / len, sprint: true };
}

interface ScreenRun {
  screener: CourtPoint;
  runner: CourtPoint;
  worstPenetration: number;
}

// A set C screener at the origin; a sprinting defender PG runs from 4 m in front at `target`.
function runIntoScreen(target: CourtPoint): ScreenRun {
  let state = game();
  place(state, OFFENSE_C, { x: 0, z: 0 });
  place(state, DEFENSE_PG, { x: 0, z: 4 });
  let worst = 0;
  for (let t = 0; t < 120; t++) {
    state = stepGame(state, [], [steerToward(state, DEFENSE_PG, target)]);
    worst = Math.max(worst, maxPenetration(state));
  }
  return {
    screener: byId(state, OFFENSE_C).pos,
    runner: byId(state, DEFENSE_PG).pos,
    worstPenetration: worst,
  };
}

describe('resolveBodyCollisions', () => {
  it('moves each of two equally massive moving players half the overlap', () => {
    const state = game();
    const vel = { x: 2, z: 0 };
    place(state, DEFENSE_PG, { x: 0, z: 0 }, vel);
    place(state, DEFENSE_SG, { x: 0.24, z: 0.32 }, vel);
    resolveBodyCollisions(state);
    const a = byId(state, DEFENSE_PG).pos;
    const b = byId(state, DEFENSE_SG).pos;
    // Distance 0.4, radii sum 0.5: each moves 0.05 along the unit normal (0.6, 0.8).
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 12);
    expect(a.x).toBeCloseTo(-0.03, 12);
    expect(a.z).toBeCloseTo(-0.04, 12);
    expect(b.x).toBeCloseTo(0.27, 12);
    expect(b.z).toBeCloseTo(0.36, 12);
  });

  it('a set screener holds while a runner aimed off its centre goes around it', () => {
    const run = runIntoScreen({ x: 0.1, z: -3 });
    expect(run.worstPenetration).toBeLessThanOrEqual(0.01);
    expect(Math.hypot(run.screener.x, run.screener.z)).toBeLessThan(0.1);
    expect(run.runner.z).toBeLessThan(run.screener.z - 0.5);
  });

  it('a runner aimed through the screener centre is held in front and never overlaps', () => {
    const run = runIntoScreen({ x: 0, z: -3 });
    expect(run.worstPenetration).toBeLessThanOrEqual(0.01);
    expect(Math.hypot(run.screener.x, run.screener.z)).toBeLessThan(0.1);
    expect(run.runner.z).toBeGreaterThan(run.screener.z);
  });

  it('a pivoting player resists like a set player', () => {
    const push = (pivotHeld: boolean): number => {
      const state = game();
      place(state, OFFENSE_C, { x: 0, z: 0 }, { x: 1, z: 0 });
      byId(state, OFFENSE_C).pivotHeld = pivotHeld;
      place(state, DEFENSE_PG, { x: 0, z: 0.5 }, { x: 0, z: -3 });
      resolveBodyCollisions(state);
      return Math.hypot(byId(state, OFFENSE_C).pos.x, byId(state, OFFENSE_C).pos.z);
    };
    const moving = push(false);
    const pivoting = push(true);
    // Overlap 0.04, split by inverse resistance against the moving PG (mass 1).
    const { C } = COLLISION.profiles;
    const share = (resistance: number): number => 1 / resistance / (1 / resistance + 1);
    expect(moving).toBeCloseTo(0.04 * share(C.mass), 12);
    expect(pivoting).toBeCloseTo(0.04 * share(C.mass * COLLISION.tuning.setMassMultiplier), 12);
    expect(pivoting).toBeLessThan(moving);
  });

  it('a Practice cone never moves from contact; the offense player takes the whole push', () => {
    let state = game('cones');
    const cone = { x: 0, z: 0 };
    place(state, DEFENSE_PG, cone);
    place(state, OFFENSE_C, { x: 0, z: 3 });
    state.controlledPlayerId = OFFENSE_PG;
    let worst = 0;
    for (let t = 0; t < 120; t++) {
      state = stepGame(state, [], [steerToward(state, OFFENSE_C, { x: 0, z: -3 })]);
      expect(byId(state, DEFENSE_PG).pos).toEqual(cone);
      worst = Math.max(worst, maxPenetration(state));
    }
    expect(worst).toBeLessThanOrEqual(0.01);
    expect(byId(state, OFFENSE_C).pos.z).toBeGreaterThan(0);

    const single = game('cones');
    place(single, DEFENSE_PG, cone);
    place(single, OFFENSE_C, { x: 0, z: 0.5 }, { x: 0, z: -3 });
    resolveBodyCollisions(single);
    expect(byId(single, DEFENSE_PG).pos).toEqual(cone);
    expect(byId(single, OFFENSE_C).pos.z).toBeCloseTo(0.54, 12);
  });

  it('never pushes a ball holder past the sideline and emits no mistake', () => {
    let state = game();
    place(state, OFFENSE_PG, { x: SIDELINE_X - 0.3, z: 0 });
    place(state, DEFENSE_PG, { x: SIDELINE_X - 1.5, z: 0 });
    expect(state.ball).toEqual({ kind: 'held', holderId: OFFENSE_PG });
    for (let t = 0; t < 120; t++) {
      state = stepGame(state, [], [steerToward(state, DEFENSE_PG, { x: SIDELINE_X + 2, z: 0 })]);
      expect(byId(state, OFFENSE_PG).pos.x).toBeLessThanOrEqual(SIDELINE_X);
      expect(state.events.filter((e) => e.type === 'mistake')).toEqual([]);
    }
    // The defender did reach and push the holder toward the line.
    expect(byId(state, OFFENSE_PG).pos.x).toBeGreaterThan(SIDELINE_X - 0.3);
  });

  it('separates coincident centres deterministically', () => {
    const run = (): GameState => {
      const state = game();
      place(state, DEFENSE_PG, { x: 1, z: 1 });
      place(state, DEFENSE_SG, { x: 1, z: 1 });
      resolveBodyCollisions(state);
      return state;
    };
    const first = run();
    expect(first).toStrictEqual(run());
    const a = byId(first, DEFENSE_PG).pos;
    const b = byId(first, DEFENSE_SG).pos;
    // Fixed normal +x from the lower index to the higher one, equal shares.
    expect(a).toEqual({ x: 0.75, z: 1 });
    expect(b).toEqual({ x: 1.25, z: 1 });
  });

  it('leaves overlapping players overlapping without a collision setup', () => {
    let state = game('live', TEST_MOVEMENT);
    expect(state.collision).toBeNull();
    place(state, DEFENSE_PG, { x: 0, z: 0 });
    place(state, DEFENSE_SG, { x: 0.1, z: 0 });
    state = stepGame(state, []);
    expect(byId(state, DEFENSE_PG).pos).toEqual({ x: 0, z: 0 });
    expect(byId(state, DEFENSE_SG).pos).toEqual({ x: 0.1, z: 0 });
  });

  it('gives identical states for the same seed and inputs with ten players moving', () => {
    const run = (): GameState => {
      let state = structuredClone(createGame({ seed: 7, movement: MOVEMENT }));
      const centre = { x: 0, z: 0 };
      for (let t = 0; t < 300; t++) {
        const commands: PlayerCommand[] = state.players
          .filter((p) => p.id !== state.controlledPlayerId)
          .map((p) => steerToward(state, p.id, t < 150 ? centre : { x: p.id - 4.5, z: -3 }));
        state = stepGame(state, [{ type: 'move', x: 0, z: -1 }], commands);
      }
      return state;
    };
    const first = run();
    expect(first).toStrictEqual(run());
    expect(maxPenetration(first)).toBeLessThanOrEqual(0.01);
  });

  describe('createGame validation', () => {
    const withCollision = (edit: (c: CollisionSetup) => void): MovementSetup => {
      const collision = structuredClone(COLLISION);
      edit(collision);
      return { ...TEST_MOVEMENT, collision };
    };

    it('copies the collision setup', () => {
      const state = createGame({ seed: 1, movement: MOVEMENT });
      expect(state.collision).toEqual(COLLISION);
      expect(state.collision).not.toBe(COLLISION);
    });

    it('throws on a missing role profile', () => {
      const movement = withCollision((c) => {
        delete (c.profiles as Partial<CollisionSetup['profiles']>).SF;
      });
      expect(() => createGame({ seed: 1, movement })).toThrow(/Court Vision/);
    });

    it('throws on radiusM <= 0', () => {
      const movement = withCollision((c) => {
        c.profiles.PG.radiusM = 0;
      });
      expect(() => createGame({ seed: 1, movement })).toThrow(/Court Vision/);
    });

    it('throws on setMassMultiplier < 1', () => {
      const movement = withCollision((c) => {
        c.tuning.setMassMultiplier = 0.5;
      });
      expect(() => createGame({ seed: 1, movement })).toThrow(/Court Vision/);
    });

    it('throws on a non-integer iterations', () => {
      const movement = withCollision((c) => {
        c.tuning.iterations = 2.5;
      });
      expect(() => createGame({ seed: 1, movement })).toThrow(/Court Vision/);
    });
  });
});
