import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from './index';
import type { GameState, MovementSetup, PlayerState, SimAction } from './index';
import { TEST_MOVEMENT } from './testMovement';

const movement = TEST_MOVEMENT;
const { tuning } = movement;
const MOVE_EAST: SimAction = { type: 'move', x: 1, z: 0 };
const SPRINT_ON: SimAction = { type: 'sprint', held: true };
const SPRINT_OFF: SimAction = { type: 'sprint', held: false };

function game(controlledPlayerId = 0): GameState {
  const state = structuredClone(createGame({ seed: 1, movement }));
  state.controlledPlayerId = controlledPlayerId;
  return state;
}

function speed(p: PlayerState): number {
  return Math.hypot(p.vel.x, p.vel.z);
}

function player(state: GameState): PlayerState {
  return state.players.find((p) => p.id === state.controlledPlayerId)!;
}

// Applies `actions` on the first step, then steps with no actions for the rest.
function run(state: GameState, actions: readonly SimAction[], ticks: number): GameState {
  let s = state;
  for (let t = 0; t < ticks; t++) {
    s = stepGame(s, t === 0 ? actions : []);
  }
  return s;
}

function ticksToTopSpeed(controlledPlayerId: number): number {
  let state = game(controlledPlayerId);
  const top = player(state).movement.speedMps;
  for (let t = 1; t <= 600; t++) {
    state = stepGame(state, t === 1 ? [MOVE_EAST] : []);
    const p = player(state);
    expect(speed(p)).toBeLessThanOrEqual(top + 1e-9);
    if (Math.abs(speed(p) - top) < 1e-9) {
      expect(speed(p)).toBeCloseTo(top);
      return t;
    }
  }
  throw new Error(`player ${controlledPlayerId} never reached top speed`);
}

describe('stepPlayerMovement', () => {
  it('a PG reaches top speed faster than a C', () => {
    const pg = ticksToTopSpeed(0);
    const c = ticksToTopSpeed(4);
    expect(pg).toBeLessThan(c);
  });

  it('accelerates gradually instead of jumping to top speed', () => {
    const p = player(run(game(), [MOVE_EAST], 1));
    expect(speed(p)).toBeCloseTo(movement.profiles.PG.accelerationMps2 / 60);
    expect(speed(p)).toBeLessThan(movement.profiles.PG.speedMps);
  });

  it('a full reversal is no slower than releasing the stick then pushing the other way', () => {
    const MOVE_WEST: SimAction = { type: 'move', x: -1, z: 0 };
    const STOP: SimAction = { type: 'move', x: 0, z: 0 };
    const top = movement.profiles.PG.speedMps;
    const cruising = run(game(), [MOVE_EAST], 120);
    expect(player(cruising).vel.x).toBeCloseTo(top);

    function ticksToWest(start: GameState, release: boolean): number {
      let s = start;
      let first = true;
      for (let t = 1; t <= 600; t++) {
        let actions: SimAction[] = first ? [MOVE_WEST] : [];
        if (release) {
          if (first) actions = [STOP];
          else if (Math.abs(player(s).vel.x) < 1e-9) actions = [MOVE_WEST];
        }
        first = false;
        s = stepGame(s, actions);
        if (Math.abs(player(s).vel.x + top) < 1e-9) return t;
      }
      throw new Error('never reversed');
    }

    expect(ticksToWest(cruising, false)).toBeLessThanOrEqual(ticksToWest(cruising, true));
  });

  it('sprint raises top speed', () => {
    const runSpeed = speed(player(run(game(), [MOVE_EAST], 120)));
    const sprintSpeed = speed(player(run(game(), [MOVE_EAST, SPRINT_ON], 120)));
    expect(runSpeed).toBeCloseTo(movement.profiles.PG.speedMps);
    expect(sprintSpeed).toBeCloseTo(movement.profiles.PG.speedMps * tuning.sprintSpeedMultiplier);
    expect(sprintSpeed).toBeGreaterThan(runSpeed);
  });

  it('sprinting drains stamina to zero', () => {
    const drainTicks = tuning.sprintDurationS * 60;
    const almost = run(game(), [MOVE_EAST, SPRINT_ON], drainTicks - 10);
    expect(player(almost).stamina).toBeGreaterThan(0);
    expect(player(almost).stamina).toBeLessThan(1);
    expect(player(almost).sprinting).toBe(true);
    const empty = run(almost, [], 15);
    expect(player(empty).stamina).toBe(0);
  });

  it('at zero stamina sprint falls back to run speed', () => {
    const empty = run(game(), [MOVE_EAST, SPRINT_ON], tuning.sprintDurationS * 60 + 5);
    expect(player(empty).stamina).toBe(0);
    const later = run(empty, [], 120);
    const p = player(later);
    expect(speed(p)).toBeCloseTo(movement.profiles.PG.speedMps);
    expect(p.sprinting).toBe(false);
    expect(p.sprintHeld).toBe(true);
    expect(p.stamina).toBe(0);
  });

  it('stamina refills when sprint is released', () => {
    const empty = run(game(), [MOVE_EAST, SPRINT_ON], tuning.sprintDurationS * 60 + 5);
    expect(player(empty).stamina).toBe(0);
    const released = stepGame(empty, [SPRINT_OFF]);
    expect(player(released).stamina).toBeGreaterThan(0);
    const full = run(released, [], tuning.staminaRefillS * 60 + 5);
    expect(player(full).stamina).toBe(1);
  });

  it('does not drain stamina when sprint is held while standing still', () => {
    const state = run(game(), [SPRINT_ON], 60);
    const p = player(state);
    expect(p.stamina).toBe(1);
    expect(p.sprinting).toBe(false);
    expect(p.vel).toEqual({ x: 0, z: 0 });
  });

  it('brakes to an exact stop after move is released', () => {
    const atSpeed = run(game(), [MOVE_EAST], 120);
    const { speedMps, accelerationMps2 } = movement.profiles.PG;
    const limit = Math.ceil((speedMps / (accelerationMps2 * tuning.brakingMultiplier)) * 60) + 1;
    let state = stepGame(atSpeed, [{ type: 'move', x: 0, z: 0 }]);
    let ticks = 1;
    while (speed(player(state)) > 0 && ticks <= limit) {
      state = stepGame(state, []);
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(limit);
    expect(player(state).vel).toEqual({ x: 0, z: 0 });
  });

  it('settles at half speed on a half-tilted stick', () => {
    const p = player(run(game(), [{ type: 'move', x: 0.5, z: 0 }], 120));
    expect(speed(p)).toBeCloseTo(0.5 * movement.profiles.PG.speedMps);
  });

  it.each(['sprint', 'pivot'] as const)('throws for a %s action with a non-boolean held', (type) => {
    const action = { type, held: 'yes' } as unknown as SimAction;
    expect(() => stepGame(game(), [action])).toThrow(/held/);
  });

  it('sets the held flags on the controlled player only', () => {
    const next = stepGame(game(), [SPRINT_ON, { type: 'pivot', held: true }]);
    expect(next.players[0]!.sprintHeld).toBe(true);
    expect(next.players[0]!.pivotHeld).toBe(true);
    expect(next.players.slice(1).some((p) => p.sprintHeld || p.pivotHeld)).toBe(false);
  });
});

describe('createGame movement validation', () => {
  function withProfiles(profiles: Record<string, unknown>): MovementSetup {
    return { ...movement, profiles } as unknown as MovementSetup;
  }

  it('rejects a setup missing the C profile', () => {
    const profiles = Object.fromEntries(
      Object.entries(movement.profiles).filter(([role]) => role !== 'C'),
    );
    expect(() => createGame({ seed: 1, movement: withProfiles(profiles) })).toThrow(/Court Vision/);
  });

  it.each([0, -1, NaN])('rejects speedMps %s', (speedMps) => {
    const profiles = { ...movement.profiles, PG: { speedMps, accelerationMps2: 9 } };
    expect(() => createGame({ seed: 1, movement: withProfiles(profiles) })).toThrow(/Court Vision/);
  });

  it('rejects a non-positive accelerationMps2', () => {
    const profiles = { ...movement.profiles, C: { speedMps: 5, accelerationMps2: 0 } };
    expect(() => createGame({ seed: 1, movement: withProfiles(profiles) })).toThrow(/Court Vision/);
  });

  it.each([
    ['sprintSpeedMultiplier', 0.5],
    ['brakingMultiplier', 0.9],
    ['sprintDurationS', 0],
    ['staminaRefillS', Infinity],
  ] as const)('rejects %s %s', (key, value) => {
    const setup: MovementSetup = { ...movement, tuning: { ...tuning, [key]: value } };
    expect(() => createGame({ seed: 1, movement: setup })).toThrow(/Court Vision/);
  });
});
