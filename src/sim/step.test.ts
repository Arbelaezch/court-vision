import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_MOVE_SPEED_MPS,
  PLAYER_COUNT,
  ROLE_ORDER,
  createGame,
  createRng,
  gameSimSeconds,
  stepGame,
} from './index';

describe('createGame', () => {
  it('has 10 players with ids 0..9', () => {
    const game = createGame({ seed: 1 });
    expect(game.players).toHaveLength(PLAYER_COUNT);
    expect(game.players.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('puts ids 0-4 on offense and 5-9 on defense, each in ROLE_ORDER', () => {
    const game = createGame({ seed: 1 });
    const offense = game.players.slice(0, 5);
    const defense = game.players.slice(5);
    expect(offense.every((p) => p.side === 'offense')).toBe(true);
    expect(defense.every((p) => p.side === 'defense')).toBe(true);
    expect(offense.map((p) => p.role)).toEqual(ROLE_ORDER);
    expect(defense.map((p) => p.role)).toEqual(ROLE_ORDER);
  });

  it('gives every player fresh point objects', () => {
    const game = createGame({ seed: 1 });
    const points = game.players.flatMap((p) => [p.pos, p.vel, p.moveIntent]);
    expect(new Set(points).size).toBe(points.length);
  });

  it('starts with the ball held by player 0 at tick 0', () => {
    const game = createGame({ seed: 1 });
    expect(game.ball).toEqual({ kind: 'held', holderId: 0 });
    expect(game.tick).toBe(0);
    expect(game.controlledPlayerId).toBe(0);
    expect(gameSimSeconds(game)).toBe(0);
  });

  it('has no shot clock by default and 1440 ticks for 24 s', () => {
    expect(createGame({ seed: 1 }).shotClockTicks).toBeNull();
    expect(createGame({ seed: 1, shotClockSeconds: 24 }).shotClockTicks).toBe(1440);
  });

  it('stores the seed and a fresh RNG for it', () => {
    const game = createGame({ seed: 777 });
    expect(game.seed).toBe(777);
    expect(game.rng).toEqual(createRng(777));
  });

  it.each([0, -1, NaN, Infinity])('rejects shotClockSeconds %s', (shotClockSeconds) => {
    expect(() => createGame({ seed: 1, shotClockSeconds })).toThrow(/shot clock/);
  });
});

describe('stepGame', () => {
  it('does not mutate its input', () => {
    const state = createGame({ seed: 3, shotClockSeconds: 24 });
    const before = structuredClone(state);
    const actions = [{ type: 'move' as const, x: 1, z: 0 }];
    const actionsBefore = structuredClone(actions);
    stepGame(state, actions);
    expect(state).toStrictEqual(before);
    expect(actions).toStrictEqual(actionsBefore);
  });

  it('increments tick', () => {
    const next = stepGame(createGame({ seed: 3 }), []);
    expect(next.tick).toBe(1);
    expect(gameSimSeconds(next)).toBeCloseTo(1 / 60);
  });

  it('decrements shotClockTicks and stops at 0', () => {
    let state = createGame({ seed: 3, shotClockSeconds: 2 / 60 });
    expect(state.shotClockTicks).toBe(2);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(1);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(0);
    state = stepGame(state, []);
    expect(state.shotClockTicks).toBe(0);
  });

  it('leaves a null shot clock alone', () => {
    expect(stepGame(createGame({ seed: 3 }), []).shotClockTicks).toBeNull();
  });

  it('moves only the controlled player on a move action', () => {
    const state = createGame({ seed: 3 });
    const next = stepGame(state, [{ type: 'move', x: 1, z: 0 }]);
    const p0 = next.players[0]!;
    expect(p0.pos.x).toBeCloseTo(state.players[0]!.pos.x + PLACEHOLDER_MOVE_SPEED_MPS / 60);
    expect(p0.pos.z).toBeCloseTo(state.players[0]!.pos.z);
    expect(p0.vel).toEqual({ x: PLACEHOLDER_MOVE_SPEED_MPS, z: 0 });
    expect(next.players.slice(1)).toEqual(state.players.slice(1));
  });

  it('keeps moving on later steps without a new action', () => {
    const moved = stepGame(createGame({ seed: 3 }), [{ type: 'move', x: 1, z: 0 }]);
    const next = stepGame(moved, []);
    expect(next.players[0]!.pos.x).toBeCloseTo(moved.players[0]!.pos.x + 4 / 60);
  });

  it('clamps the move vector to length 1', () => {
    const next = stepGame(createGame({ seed: 3 }), [{ type: 'move', x: 3, z: 4 }]);
    expect(next.players[0]!.moveIntent.x).toBeCloseTo(0.6);
    expect(next.players[0]!.moveIntent.z).toBeCloseTo(0.8);
  });

  it('keeps a short move vector as is', () => {
    const next = stepGame(createGame({ seed: 3 }), [{ type: 'move', x: 0.3, z: -0.4 }]);
    expect(next.players[0]!.moveIntent).toEqual({ x: 0.3, z: -0.4 });
  });

  it('does not touch the ball', () => {
    const state = createGame({ seed: 3 });
    expect(stepGame(state, [{ type: 'move', x: 1, z: 1 }]).ball).toEqual(state.ball);
  });

  it.each([
    [NaN, 0],
    [0, Infinity],
  ])('throws for a non-finite move (%s, %s)', (x, z) => {
    expect(() => stepGame(createGame({ seed: 3 }), [{ type: 'move', x, z }])).toThrow(/finite/);
  });
});
