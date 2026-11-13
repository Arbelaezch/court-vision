import { describe, expect, it } from 'vitest';
import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X, createGame, stepGame } from './index';
import type { GameEvent, GameState, SimAction } from './index';
import { TEST_MOVEMENT } from './testMovement';

const OOB: GameEvent['type'] = 'mistake';

function newGame(): GameState {
  return createGame({ seed: 1, movement: TEST_MOVEMENT });
}

function player0(state: GameState) {
  const p = state.players[0];
  if (p === undefined) {
    throw new Error('missing player 0');
  }
  return p;
}

/** Steps with the given actions on the first tick only, then no actions, collecting every state. */
function run(start: GameState, first: SimAction[], ticks: number): GameState[] {
  const states: GameState[] = [];
  let state = start;
  for (let i = 0; i < ticks; i += 1) {
    state = stepGame(state, i === 0 ? first : []);
    states.push(state);
  }
  return states;
}

describe('out of bounds turnover', () => {
  it('createGame starts with no events', () => {
    expect(newGame().events).toEqual([]);
  });

  it('carrying the ball past the sideline emits exactly one turnover', () => {
    const states = run(newGame(), [{ type: 'move', x: 1, z: 0 }], 400);
    const withEvents = states.filter((s) => s.events.length > 0);
    expect(withEvents).toHaveLength(1);
    const crossing = withEvents[0];
    expect(crossing?.events).toEqual([
      { type: OOB, tick: crossing?.tick, kind: 'turnover', reason: 'Out of bounds' },
    ]);
    expect(player0(crossing as GameState).pos.x).toBeGreaterThan(SIDELINE_X);
    const last = states[states.length - 1] as GameState;
    expect(player0(last).pos.x).toBeGreaterThan(SIDELINE_X);
    expect(last.events).toEqual([]);
  });

  it('carrying the ball past the baseline emits exactly one turnover', () => {
    const states = run(newGame(), [{ type: 'move', x: 0, z: -1 }], 400);
    const withEvents = states.filter((s) => s.events.length > 0);
    expect(withEvents).toHaveLength(1);
    const crossing = withEvents[0] as GameState;
    expect(crossing.events).toEqual([
      { type: OOB, tick: crossing.tick, kind: 'turnover', reason: 'Out of bounds' },
    ]);
    expect(player0(crossing).pos.z).toBeLessThan(BASELINE_Z);
  });

  it('does not change the ball when the holder goes out', () => {
    const states = run(newGame(), [{ type: 'move', x: 1, z: 0 }], 400);
    expect((states[states.length - 1] as GameState).ball).toEqual({ kind: 'held', holderId: 0 });
  });

  it('clamps the holder at the half-court line without an event', () => {
    const states = run(newGame(), [{ type: 'move', x: 0, z: 1 }], 400);
    for (const s of states) {
      expect(player0(s).pos.z).toBeLessThanOrEqual(HALF_COURT_LINE_Z);
      expect(s.events).toEqual([]);
    }
    const last = states[states.length - 1] as GameState;
    expect(player0(last).pos.z).toBe(HALF_COURT_LINE_Z);
    expect(player0(last).vel.z).toBe(0);
  });

  it('clamps a player without the ball at the sideline and never emits', () => {
    const start = newGame();
    start.ball = { kind: 'held', holderId: 1 };
    const states = run(start, [{ type: 'move', x: -1, z: 0 }], 300);
    for (const s of states) {
      expect(s.events).toEqual([]);
    }
    const last = states[states.length - 1] as GameState;
    expect(player0(last).pos.x).toBe(-SIDELINE_X);
    expect(player0(last).vel.x).toBe(0);
  });

  it('has empty events on steps with no crossing', () => {
    const states = run(newGame(), [{ type: 'move', x: 1, z: 0 }], 30);
    for (const s of states) {
      expect(s.events).toEqual([]);
    }
  });
});

describe('pivot and protect', () => {
  function movingGame(): GameState {
    let state = newGame();
    state = stepGame(state, [{ type: 'move', x: 1, z: 0 }]);
    for (let i = 0; i < 20; i += 1) {
      state = stepGame(state, []);
    }
    expect(player0(state).vel.x).toBeGreaterThan(1);
    return state;
  }

  it('holding pivot keeps the player in place and sets a protect state', () => {
    let state = stepGame(movingGame(), [{ type: 'pivot', held: true }]);
    const pinned = { ...player0(state).pos };
    for (let i = 0; i < 31; i += 1) {
      const p = player0(state);
      expect(p.pos).toEqual(pinned);
      expect(p.vel).toEqual({ x: 0, z: 0 });
      expect(p.protecting).toBe(true);
      expect(p.moveIntent).toEqual({ x: 1, z: 0 });
      state = stepGame(state, []);
    }
  });

  it('releasing pivot clears protect and accelerates again from rest', () => {
    let state = stepGame(movingGame(), [{ type: 'pivot', held: true }]);
    state = stepGame(state, []);
    const x0 = player0(state).pos.x;
    state = stepGame(state, [{ type: 'pivot', held: false }]);
    const p = player0(state);
    expect(p.protecting).toBe(false);
    expect(p.vel.x).toBeCloseTo(p.movement.accelerationMps2 / 60, 9);
    expect(p.pos.x).toBeGreaterThan(x0);
  });

  it('pivot with sprint held does not drain stamina', () => {
    let state = stepGame(movingGame(), [
      { type: 'sprint', held: true },
      { type: 'pivot', held: true },
    ]);
    for (let i = 0; i < 120; i += 1) {
      state = stepGame(state, []);
    }
    const p = player0(state);
    expect(p.stamina).toBe(1);
    expect(p.sprinting).toBe(false);
  });
});
