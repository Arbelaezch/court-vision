import { describe, expect, it } from 'vitest';
import { createGame, rateLook, stepGame } from '../sim';
import type { GameState } from '../sim';
import { loadCastContent } from './cast';
import { loadShotTuning } from './shooting';
import { loadSimMovement } from './simMovement';
import { loadSimShooting, simShootingSetup } from './simShooting';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
// Far from the action, one spot per player id 0..9.
const PARKING = [
  { x: -7, z: 6 },
  { x: -5.5, z: 6 },
  { x: -4, z: 6 },
  { x: 4, z: 6 },
  { x: 5.5, z: 6 },
  { x: 7, z: 6 },
  { x: -7, z: 4.5 },
  { x: 7, z: 4.5 },
  { x: -5.5, z: 4.5 },
  { x: 5.5, z: 4.5 },
];

function game(seed: number, placed: Record<number, { x: number; z: number }>): GameState {
  const state = structuredClone(
    createGame({ seed, movement: loadSimMovement(), shooting: loadSimShooting() }),
  );
  for (const p of state.players) p.pos = placed[p.id] ?? { ...PARKING[p.id]! };
  return state;
}

describe('loadSimShooting', () => {
  it('maps each role to its default archetype shooting numbers', () => {
    const setup = loadSimShooting();
    expect(setup.profiles.PG).toEqual({
      shooting: { rim: 60, midRange: 65, three: 70 },
      defensiveAwareness: 70,
      reachM: 2.45,
    });
    expect(setup.profiles.C).toEqual({
      shooting: { rim: 85, midRange: 40, three: 20 },
      defensiveAwareness: 80,
      reachM: 2.85,
    });
  });

  it('copies the shot tuning rather than aliasing it', () => {
    const tuning = loadShotTuning();
    const setup = simShootingSetup(loadCastContent(), tuning);
    expect(setup.tuning).toEqual(tuning);
    expect(setup.tuning).not.toBe(tuning);
  });

  it('throws when a role points at a missing archetype', () => {
    const broken = { ...loadCastContent(), archetypes: {} };
    expect(() => simShootingSetup(broken, loadShotTuning())).toThrow(/Court Vision/);
  });
});

describe('shots with real content', () => {
  it('rates a PG floater over the C at the rim better than a layup', () => {
    const s = game(1, { 0: { x: 0, z: -4.3 }, 9: { x: 0, z: -5.2 } });
    const layup = rateLook(s, 0, 'layup', 1);
    const floater = rateLook(s, 0, 'floater', 1);
    expect(floater.score).toBeGreaterThan(layup.score);
    expect(layup.look).toBe('bad');
    expect(floater.look).toBe('good');
  });

  it('rates a C three as out of range', () => {
    const s = game(1, { 4: { x: 0, z: 1.5 } });
    const rating = rateLook(s, 4, 'three', 1);
    expect(rating.look).toBe('bad');
    expect(rating.reason).toBe('Shot out of range');
  });

  it.each(SEEDS)('a PG jumper with the C close in front is blocked (seed %i)', (seed) => {
    const s = game(seed, { 0: { x: 0, z: -1 }, 9: { x: 0, z: -1.4 } });
    // The ball starts with player 0, the controlled player.
    const next = stepGame(s, [{ type: 'shoot' }]);
    expect(next.events).toContainEqual(
      expect.objectContaining({ type: 'mistake', kind: 'turnover', reason: 'Contested shot' }),
    );
  });
});
