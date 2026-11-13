import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../sim';
import type { GameEvent, GameState, SimAction } from '../sim';
import { loadCastContent } from './cast';
import { loadPassTuning } from './passing';
import { loadSimMovement } from './simMovement';
import { loadSimPassing, simPassingSetup } from './simPassing';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
// Off the 0 -> 1 path, for ids 2..9.
const PARKING = [
  { x: -7, z: 6 },
  { x: -5.5, z: 6 },
  { x: -4, z: 6 },
  { x: 4, z: 6 },
  { x: 5.5, z: 6 },
  { x: 7, z: 6 },
  { x: -7, z: 4.5 },
  { x: 7, z: 4.5 },
];

function game(seed: number, defenderId: number): GameState {
  const state = structuredClone(
    createGame({ seed, movement: loadSimMovement(), passing: loadSimPassing() }),
  );
  for (const p of state.players) {
    if (p.id === 0) p.pos = { x: 0, z: 2 };
    else if (p.id === 1) p.pos = { x: 0, z: -4 };
    else p.pos = { ...PARKING[p.id - 2]! };
  }
  state.players.find((p) => p.id === defenderId)!.pos = { x: 0, z: -1 };
  return state;
}

function settle(start: GameState, action: SimAction): { state: GameState; events: GameEvent[] } {
  let s = stepGame(start, [action]);
  const events = [...s.events];
  for (let t = 1; t < 180 && s.ball.kind === 'inFlight'; t++) {
    s = stepGame(s, []);
    events.push(...s.events);
  }
  return { state: s, events };
}

describe('loadSimPassing', () => {
  it('maps each role to its default archetype passing numbers', () => {
    const setup = loadSimPassing();
    expect(setup.profiles.PG).toEqual({
      passing: 90,
      ballSecurity: 85,
      defensiveAwareness: 70,
      reachM: 2.45,
    });
    expect(setup.profiles.C).toEqual({
      passing: 50,
      ballSecurity: 50,
      defensiveAwareness: 80,
      reachM: 2.85,
    });
  });

  it('copies the pass tuning rather than aliasing it', () => {
    const tuning = loadPassTuning();
    const setup = simPassingSetup(loadCastContent(), tuning);
    expect(setup.tuning).toEqual(tuning);
    expect(setup.tuning).not.toBe(tuning);
    expect(setup.tuning.lob).not.toBe(tuning.lob);
  });

  it('throws when a role points at a missing archetype', () => {
    const broken = { ...loadCastContent(), archetypes: {} };
    expect(() => simPassingSetup(broken, loadPassTuning())).toThrow(/Court Vision/);
  });
});

describe('passes with real content', () => {
  it.each(SEEDS)('chest is intercepted, bounce completes past defender 6 (seed %i)', (seed) => {
    const start = game(seed, 6);

    const chest = settle(start, { type: 'pass', passType: 'chestPass', targetId: 1 });
    expect(chest.events).toEqual([
      expect.objectContaining({
        type: 'mistake',
        kind: 'turnover',
        reason: 'Passed into a crowded lane',
      }),
    ]);
    expect(chest.state.ball).toEqual({ kind: 'held', holderId: 6 });

    const bounce = settle(start, { type: 'pass', passType: 'bouncePass', targetId: 1 });
    expect(bounce.events).toEqual([
      expect.objectContaining({ type: 'passCompleted', receiverId: 1 }),
    ]);
  });

  it.each(SEEDS)('lob completes over defender 9 (seed %i)', (seed) => {
    const lob = settle(game(seed, 9), { type: 'pass', passType: 'lob', targetId: 1 });
    expect(lob.events).toEqual([expect.objectContaining({ type: 'passCompleted', receiverId: 1 })]);
  });
});
