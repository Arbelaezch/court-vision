import { describe, expect, it } from 'vitest';
import { SIDELINE_X, createGame, stepGame } from './index';
import type { CourtPoint, GameEvent, GameState, PlayerCommand, PlayerState } from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_PASSING } from './testPassing';

function player(state: GameState, id: number): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

function fresh(seed = 1): GameState {
  return createGame({ seed, movement: TEST_MOVEMENT, passing: TEST_PASSING });
}

/** Steps `ticks` times with the same commands and no actions. */
function run(state: GameState, commands: readonly PlayerCommand[], ticks: number): GameState {
  let s = state;
  for (let t = 0; t < ticks; t++) {
    s = stepGame(s, [], commands);
  }
  return s;
}

function heldBy(state: GameState): number | null {
  return state.ball.kind === 'held' ? state.ball.holderId : null;
}

describe('steer command', () => {
  it('walks a non-controlled player in the commanded direction', () => {
    const start = fresh();
    const before = player(start, 1).pos;
    const pg = player(start, 0).pos;
    const end = run(start, [{ type: 'steer', playerId: 1, x: 1, z: 0 }], 30);
    const after = player(end, 1).pos;
    expect(after.x).toBeGreaterThan(before.x + 0.5);
    expect(after.z).toBeCloseTo(before.z, 6);
    expect(player(end, 0).pos).toEqual(pg);
  });

  it('clamps the intent to unit length', () => {
    const next = stepGame(fresh(), [], [{ type: 'steer', playerId: 1, x: 3, z: 4 }]);
    const intent = player(next, 1).moveIntent;
    expect(intent.x).toBeCloseTo(0.6, 12);
    expect(intent.z).toBeCloseTo(0.8, 12);
  });
});

describe('place command', () => {
  it('teleports the player with zero velocity and intent', () => {
    const moving = run(fresh(), [{ type: 'steer', playerId: 7, x: 0, z: 1 }], 10);
    expect(Math.hypot(player(moving, 7).vel.x, player(moving, 7).vel.z)).toBeGreaterThan(0);
    const spot: CourtPoint = { x: 1.5, z: 0.5 };
    const next = stepGame(moving, [], [{ type: 'place', playerId: 7, ...spot }]);
    const placed = player(next, 7);
    expect(placed.pos).toEqual(spot);
    expect(placed.vel).toEqual({ x: 0, z: 0 });
    expect(placed.moveIntent).toEqual({ x: 0, z: 0 });
  });
});

describe('pass command', () => {
  it('passes from the AI holder with that passerId', () => {
    const start = structuredClone(fresh());
    start.ball = { kind: 'held', holderId: 1 };
    let s = stepGame(
      start,
      [],
      [{ type: 'pass', playerId: 1, passType: 'chestPass', targetId: 0 }],
    );
    expect(s.ball.kind).toBe('inFlight');
    const events: GameEvent[] = [...s.events];
    for (let t = 0; t < 180 && s.ball.kind === 'inFlight'; t++) {
      s = stepGame(s, []);
      events.push(...s.events);
    }
    expect(events).toEqual([
      expect.objectContaining({ type: 'passCompleted', passerId: 1, receiverId: 0 }),
    ]);
    expect(heldBy(s)).toBe(0);
  });

  it('ignores a pass from a non-holder', () => {
    const start = fresh();
    const next = stepGame(
      start,
      [],
      [{ type: 'pass', playerId: 1, passType: 'chestPass', targetId: 2 }],
    );
    expect(next.ball).toEqual(start.ball);
    expect(next.events).toEqual([]);
  });
});

describe('command validation', () => {
  const bad: [string, PlayerCommand][] = [
    ['steer on the controlled player', { type: 'steer', playerId: 0, x: 1, z: 0 }],
    ['place on the controlled player', { type: 'place', playerId: 0, x: 1, z: 0 }],
    [
      'pass from the controlled player',
      { type: 'pass', playerId: 0, passType: 'chestPass', targetId: 1 },
    ],
    ['steer on an unknown player', { type: 'steer', playerId: 42, x: 1, z: 0 }],
    ['place on a non-integer id', { type: 'place', playerId: 1.5, x: 1, z: 0 }],
    ['steer with a non-finite x', { type: 'steer', playerId: 1, x: Number.NaN, z: 0 }],
    ['place with an infinite z', { type: 'place', playerId: 1, x: 0, z: Infinity }],
    ['place out of bounds', { type: 'place', playerId: 7, x: SIDELINE_X + 1, z: 0 }],
  ];
  it.each(bad)('throws for %s', (_name, command) => {
    expect(() => stepGame(fresh(), [], [command])).toThrow(/^Court Vision: /);
  });
});

describe('stepGame with commands', () => {
  it('no commands equals an empty command list', () => {
    const s = fresh(7);
    const actions = [{ type: 'move', x: 0.3, z: -1 } as const];
    expect(stepGame(s, actions)).toEqual(stepGame(s, actions, []));
  });

  it('does not mutate its input', () => {
    const s = fresh(3);
    const copy = structuredClone(s);
    stepGame(
      s,
      [{ type: 'move', x: 1, z: 0 }],
      [
        { type: 'steer', playerId: 1, x: 0, z: 1 },
        { type: 'place', playerId: 6, x: 2, z: -2 },
      ],
    );
    expect(s).toEqual(copy);
  });
});
