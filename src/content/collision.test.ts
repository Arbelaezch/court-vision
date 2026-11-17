/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../sim';
import type { GameState, PlayerCommand, PlayerState } from '../sim';
import { loadCastContent } from './cast';
import { loadCollisionTuning, type CollisionTuningSpec } from './collision';
import { ARCHETYPES_FILE, COLLISION_TUNING_DATA } from './data/archetypes';
import { loadMovementTuning } from './movement';
import { loadSimMovement, simMovementSetup } from './simMovement';

describe('loadCollisionTuning', () => {
  it('loads the bundled values', () => {
    const tuning = loadCollisionTuning();
    expect(tuning).toEqual(COLLISION_TUNING_DATA);
    expect(tuning).not.toBe(COLLISION_TUNING_DATA);
  });

  it.each([
    ['a missing body type', (d: any) => delete d.bodies.wing],
    ['an unknown key', (d: any) => (d.friction = 0.2)],
    ['radiusM 0.4', (d: any) => (d.bodies.guard.radiusM = 0.4)],
    ['mass 0', (d: any) => (d.bodies.big.mass = 0)],
    ['iterations 2.5', (d: any) => (d.iterations = 2.5)],
    ['setMassMultiplier 60', (d: any) => (d.setMassMultiplier = 60)],
  ])('rejects %s', (_label, mutate) => {
    const data = structuredClone(COLLISION_TUNING_DATA);
    mutate(data);
    expect(() => loadCollisionTuning({ file: ARCHETYPES_FILE, data })).toThrow(/Court Vision/);
  });

  it('keeps every pair of bodies under 0.6 m and two guards under 0.5 m apart at contact', () => {
    const { bodies } = loadCollisionTuning();
    const radii = Object.values(bodies).map((b) => b.radiusM);
    expect(2 * Math.max(...radii)).toBeLessThan(0.6);
    expect(2 * bodies.guard.radiusM).toBeLessThan(0.5);
  });
});

describe('simMovementSetup collision', () => {
  it('maps PG/SG to guard, SF to wing and PF/C to big', () => {
    const { bodies } = loadCollisionTuning();
    const collision = loadSimMovement().collision!;
    expect(collision).not.toBeNull();
    expect(collision.profiles.PG).toEqual(bodies.guard);
    expect(collision.profiles.SG).toEqual(bodies.guard);
    expect(collision.profiles.SF).toEqual(bodies.wing);
    expect(collision.profiles.PF).toEqual(bodies.big);
    expect(collision.profiles.C).toEqual(bodies.big);
  });

  it('uses a custom collision tuning when given one', () => {
    const custom: CollisionTuningSpec = {
      bodies: {
        guard: { radiusM: 0.2, mass: 1 },
        wing: { radiusM: 0.21, mass: 2 },
        big: { radiusM: 0.22, mass: 3 },
      },
      setSpeedMps: 0.5,
      setMassMultiplier: 30,
      iterations: 2,
    };
    const setup = simMovementSetup(loadCastContent(), loadMovementTuning(), custom);
    expect(setup.collision!.profiles.SF).toEqual({ radiusM: 0.21, mass: 2 });
    expect(setup.collision!.tuning).toEqual({
      setSpeedMps: 0.5,
      setMassMultiplier: 30,
      iterations: 2,
    });
  });

  it('with the bundled setup a set C holds against a PG sprinting into its centre', () => {
    const OFFENSE_C = 4;
    const DEFENSE_PG = 5;
    let state: GameState = structuredClone(createGame({ seed: 1, movement: loadSimMovement() }));
    state.players.forEach((p, i) => {
      p.pos = { x: -6.75 + i * 1.5, z: -5 };
    });
    const byId = (s: GameState, id: number): PlayerState => s.players.find((p) => p.id === id)!;
    byId(state, OFFENSE_C).pos = { x: 0, z: 0 };
    byId(state, DEFENSE_PG).pos = { x: 0, z: 4 };
    const contact = state.collision!.profiles.C.radiusM + state.collision!.profiles.PG.radiusM;
    let worst = 0;
    for (let t = 0; t < 120; t++) {
      const runner = byId(state, DEFENSE_PG);
      const dz = -3 - runner.pos.z;
      const steer: PlayerCommand =
        Math.abs(dz) < 0.05
          ? { type: 'steer', playerId: DEFENSE_PG, x: 0, z: 0 }
          : { type: 'steer', playerId: DEFENSE_PG, x: 0, z: Math.sign(dz), sprint: true };
      state = stepGame(state, [], [steer]);
      const c = byId(state, OFFENSE_C).pos;
      const r = byId(state, DEFENSE_PG).pos;
      worst = Math.max(worst, contact - Math.hypot(c.x - r.x, c.z - r.z));
    }
    const c = byId(state, OFFENSE_C).pos;
    expect(Math.hypot(c.x, c.z)).toBeLessThan(0.15);
    // The runner was held in front of the screener short of its target behind it.
    expect(byId(state, DEFENSE_PG).pos.z).toBeGreaterThan(c.z);
    expect(worst).toBeLessThanOrEqual(0.01);
  });
});
