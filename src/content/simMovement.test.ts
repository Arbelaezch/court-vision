import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../sim';
import type { GameState, PlayerState, SimAction } from '../sim';
import { loadCastContent } from './cast';
import { loadMovementTuning } from './movement';
import { loadSimMovement, simMovementSetup } from './simMovement';

const MOVE_EAST: SimAction = { type: 'move', x: 1, z: 0 };

function speed(p: PlayerState): number {
  return Math.hypot(p.vel.x, p.vel.z);
}

function controlled(state: GameState): PlayerState {
  return state.players.find((p) => p.id === state.controlledPlayerId)!;
}

function bundledGame(controlledPlayerId: number): GameState {
  const state = structuredClone(createGame({ seed: 1, movement: loadSimMovement() }));
  state.controlledPlayerId = controlledPlayerId;
  return state;
}

function ticksToTopSpeed(controlledPlayerId: number): number {
  let state = bundledGame(controlledPlayerId);
  const top = controlled(state).movement.speedMps;
  for (let t = 1; t <= 600; t++) {
    state = stepGame(state, t === 1 ? [MOVE_EAST] : []);
    if (Math.abs(speed(controlled(state)) - top) < 1e-9) return t;
  }
  throw new Error(`player ${controlledPlayerId} never reached top speed`);
}

describe('loadSimMovement', () => {
  it('maps each role to its default archetype speed and acceleration', () => {
    const setup = loadSimMovement();
    expect(setup.profiles.PG).toEqual({ speedMps: 6.5, accelerationMps2: 9.0 });
    expect(setup.profiles.C).toEqual({ speedMps: 5.2, accelerationMps2: 6.0 });
  });

  it('copies the bundled movement tuning', () => {
    const tuning = loadMovementTuning();
    const setup = simMovementSetup(loadCastContent(), tuning);
    expect(setup.tuning).toEqual(tuning);
    expect(setup.tuning).not.toBe(tuning);
  });

  it('throws when a role points at a missing archetype', () => {
    const cast = loadCastContent();
    const broken = { ...cast, archetypes: {} };
    expect(() => simMovementSetup(broken, loadMovementTuning())).toThrow(/Court Vision/);
  });

  it('with the real tuning file a PG reaches top speed faster than a C', () => {
    expect(ticksToTopSpeed(0)).toBeLessThan(ticksToTopSpeed(4));
  });

  it('with the real tuning file sprint top speed is above run speed', () => {
    let run = bundledGame(0);
    let sprint = bundledGame(0);
    for (let t = 0; t < 180; t++) {
      run = stepGame(run, t === 0 ? [MOVE_EAST] : []);
      sprint = stepGame(sprint, t === 0 ? [MOVE_EAST, { type: 'sprint', held: true }] : []);
    }
    expect(speed(controlled(run))).toBeCloseTo(6.5);
    expect(speed(controlled(sprint))).toBeGreaterThan(speed(controlled(run)));
  });
});
