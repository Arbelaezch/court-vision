import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from './index';
import type { GameState, PlayerCommand, PlayerState } from './index';
import { TEST_MOVEMENT } from './testMovement';

const movement = TEST_MOVEMENT;
const { tuning } = movement;

function game(): GameState {
  const state = structuredClone(createGame({ seed: 1, movement }));
  state.controlledPlayerId = 0;
  return state;
}

function p1(state: GameState): PlayerState {
  return state.players.find((p) => p.id === 1)!;
}

function speed(p: PlayerState): number {
  return Math.hypot(p.vel.x, p.vel.z);
}

function steer(sprint?: boolean): PlayerCommand {
  const base = { type: 'steer', playerId: 1, x: 1, z: 0 } as const;
  return sprint === undefined ? base : { ...base, sprint };
}

describe('steer sprint flag', () => {
  it('sprinting steer reaches sprint speed and no more', () => {
    const top = p1(game()).movement.speedMps;
    let s = game();
    let max = 0;
    for (let t = 0; t < 300; t++) {
      s = stepGame(s, [], [steer(true)]);
      max = Math.max(max, speed(p1(s)));
      if (t < 120) {
        expect(speed(p1(s))).toBeLessThanOrEqual(top * tuning.sprintSpeedMultiplier + 1e-9);
      }
    }
    expect(max).toBeGreaterThan(top);
    expect(max).toBeLessThanOrEqual(top * tuning.sprintSpeedMultiplier + 1e-9);
    // Check the sprinting flag while stamina remains.
    let fresh = game();
    for (let t = 0; t < 90; t++) fresh = stepGame(fresh, [], [steer(true)]);
    expect(p1(fresh).sprinting).toBe(true);
  });

  it('steer without sprint never exceeds walking top speed', () => {
    const top = p1(game()).movement.speedMps;
    let s = game();
    for (let t = 0; t < 300; t++) {
      s = stepGame(s, [], [steer()]);
      expect(speed(p1(s))).toBeLessThanOrEqual(top + 1e-9);
      expect(p1(s).sprintHeld).toBe(false);
    }
  });

  it('drains stamina and falls back to walking speed when it runs out', () => {
    const top = p1(game()).movement.speedMps;
    let s = game();
    const start = p1(s).stamina;
    let drained = false;
    for (let t = 0; t < 600; t++) {
      s = stepGame(s, [], [steer(true)]);
      if (p1(s).stamina < start) drained = true;
    }
    expect(drained).toBe(true);
    expect(p1(s).stamina).toBe(0);
    expect(speed(p1(s))).toBeLessThanOrEqual(top + 1e-9);
  });

  it('rejects a non-boolean sprint', () => {
    const bad = { type: 'steer', playerId: 1, x: 1, z: 0, sprint: 1 } as unknown as PlayerCommand;
    expect(() => stepGame(game(), [], [bad])).toThrow('sprint must be a boolean');
  });
});
