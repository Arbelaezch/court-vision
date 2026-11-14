import { describe, expect, it } from 'vitest';
import { PLAYER_COUNT, ROLE_ORDER, createGame, createRng, gameSimSeconds, stepGame } from './index';
import { TEST_MOVEMENT } from './testMovement';

const movement = TEST_MOVEMENT;

describe('createGame', () => {
  it('has 10 players with ids 0..9', () => {
    const game = createGame({ seed: 1, movement });
    expect(game.players).toHaveLength(PLAYER_COUNT);
    expect(game.players.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('puts ids 0-4 on offense and 5-9 on defense, each in ROLE_ORDER', () => {
    const game = createGame({ seed: 1, movement });
    const offense = game.players.slice(0, 5);
    const defense = game.players.slice(5);
    expect(offense.every((p) => p.side === 'offense')).toBe(true);
    expect(defense.every((p) => p.side === 'defense')).toBe(true);
    expect(offense.map((p) => p.role)).toEqual(ROLE_ORDER);
    expect(defense.map((p) => p.role)).toEqual(ROLE_ORDER);
  });

  it('gives every player fresh point objects', () => {
    const game = createGame({ seed: 1, movement });
    const points = game.players.flatMap((p) => [p.pos, p.vel, p.moveIntent, p.movement]);
    expect(new Set(points).size).toBe(points.length);
    const profiles = Object.values(movement.profiles);
    expect(game.players.some((p) => profiles.includes(p.movement))).toBe(false);
    expect(game.movementTuning).not.toBe(movement.tuning);
    expect(game.movementTuning).toEqual(movement.tuning);
  });

  it("copies each role's movement profile to both sides", () => {
    const game = createGame({ seed: 1, movement });
    for (const p of game.players) {
      expect(p.movement).toEqual(movement.profiles[p.role]);
    }
  });

  it('starts every player with full stamina and no held or effective inputs', () => {
    const game = createGame({ seed: 1, movement });
    for (const p of game.players) {
      expect(p.stamina).toBe(1);
      expect(p.sprintHeld).toBe(false);
      expect(p.sprinting).toBe(false);
      expect(p.pivotHeld).toBe(false);
      expect(p.protecting).toBe(false);
    }
  });

  it('starts with the ball held by player 0 at tick 0', () => {
    const game = createGame({ seed: 1, movement });
    expect(game.ball).toEqual({ kind: 'held', holderId: 0 });
    expect(game.tick).toBe(0);
    expect(game.controlledPlayerId).toBe(0);
    expect(gameSimSeconds(game)).toBe(0);
  });

  it('has no shot clock by default and 1440 ticks for 24 s', () => {
    expect(createGame({ seed: 1, movement }).shotClockTicks).toBeNull();
    expect(createGame({ seed: 1, shotClockSeconds: 24, movement }).shotClockTicks).toBe(1440);
  });

  it('stores the seed and a fresh RNG for it', () => {
    const game = createGame({ seed: 777, movement });
    expect(game.seed).toBe(777);
    expect(game.rng).toEqual(createRng(777));
  });

  it.each([0, -1, NaN, Infinity])('rejects shotClockSeconds %s', (shotClockSeconds) => {
    expect(() => createGame({ seed: 1, shotClockSeconds, movement })).toThrow(/shot clock/);
  });
});

describe('stepGame', () => {
  it('does not mutate its input', () => {
    const state = createGame({ seed: 3, shotClockSeconds: 24, movement });
    const before = structuredClone(state);
    const actions = [{ type: 'move' as const, x: 1, z: 0 }];
    const actionsBefore = structuredClone(actions);
    stepGame(state, actions);
    expect(state).toStrictEqual(before);
    expect(actions).toStrictEqual(actionsBefore);
  });

  it('increments tick', () => {
    const next = stepGame(createGame({ seed: 3, movement }), []);
    expect(next.tick).toBe(1);
    expect(gameSimSeconds(next)).toBeCloseTo(1 / 60);
  });

  it('decrements shotClockTicks and stops at 0', () => {
    let state = createGame({ seed: 3, shotClockSeconds: 2 / 60, movement });
    expect(state.shotClockTicks).toBe(2);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(1);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(0);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(0);
  });

  it('leaves a null shot clock alone', () => {
    expect(stepGame(createGame({ seed: 3, movement }), []).shotClockTicks).toBeNull();
  });

  it('moves only the controlled player on a move action', () => {
    const state = createGame({ seed: 3, movement });
    const next = stepGame(state, [{ type: 'move', x: 1, z: 0 }]);
    const p0 = next.players[0]!;
    const firstTickSpeed = movement.profiles.PG.accelerationMps2 / 60;
    expect(p0.vel.x).toBeCloseTo(firstTickSpeed);
    expect(p0.vel.z).toBe(0);
    expect(p0.pos.x).toBeCloseTo(state.players[0]!.pos.x + firstTickSpeed / 60);
    expect(p0.pos.z).toBeCloseTo(state.players[0]!.pos.z);
    for (const [i, p] of next.players.slice(1).entries()) {
      const before = state.players[i + 1]!;
      expect(p.pos).toEqual(before.pos);
      expect(p.vel).toEqual(before.vel);
    }
    expect(next.players.slice(1)).toEqual(state.players.slice(1));
  });

  it('keeps moving on later steps without a new action', () => {
    const moved = stepGame(createGame({ seed: 3, movement }), [{ type: 'move', x: 1, z: 0 }]);
    const next = stepGame(moved, []);
    const later = stepGame(next, []);
    expect(next.players[0]!.pos.x).toBeGreaterThan(moved.players[0]!.pos.x);
    expect(later.players[0]!.pos.x).toBeGreaterThan(next.players[0]!.pos.x);
    expect(next.players[0]!.vel.x).toBeGreaterThan(moved.players[0]!.vel.x);
  });

  it('clamps the move vector to length 1', () => {
    const next = stepGame(createGame({ seed: 3, movement }), [{ type: 'move', x: 3, z: 4 }]);
    expect(next.players[0]!.moveIntent.x).toBeCloseTo(0.6);
    expect(next.players[0]!.moveIntent.z).toBeCloseTo(0.8);
  });

  it('keeps a short move vector as is', () => {
    const next = stepGame(createGame({ seed: 3, movement }), [{ type: 'move', x: 0.3, z: -0.4 }]);
    expect(next.players[0]!.moveIntent).toEqual({ x: 0.3, z: -0.4 });
  });

  it('does not touch the ball', () => {
    const state = createGame({ seed: 3, movement });
    expect(stepGame(state, [{ type: 'move', x: 1, z: 1 }]).ball).toEqual(state.ball);
  });

  it.each([
    [NaN, 0],
    [0, Infinity],
  ])('throws for a non-finite move (%s, %s)', (x, z) => {
    expect(() => stepGame(createGame({ seed: 3, movement }), [{ type: 'move', x, z }])).toThrow(
      /finite/,
    );
  });
});
