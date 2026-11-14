import { describe, expect, it } from 'vitest';
import { loadSimMovement } from '../content';
import { createGame, type GameState, type RoleId } from '../sim';
import { OPENING_SEPARATION_M, isTeammateOpen } from './index';

/** Every defender is far away, except SG's own, who is `gap` m to the side of the offense SG. */
function gameWithGap(gap: number): GameState {
  const game = structuredClone(createGame({ seed: 1, movement: loadSimMovement() }));
  let i = 0;
  for (const p of game.players) {
    p.pos = p.side === 'offense' ? { x: -10 + i, z: 0 } : { x: -10 + i, z: 30 };
    i += 1;
  }
  const sg = game.players.find((p) => p.side === 'offense' && p.role === 'SG');
  const guard = game.players.find((p) => p.side === 'defense' && p.role === 'SG');
  if (sg === undefined || guard === undefined) throw new Error('missing SG');
  guard.pos = { x: sg.pos.x, z: sg.pos.z + gap };
  return game;
}

describe('isTeammateOpen', () => {
  it('is open with the nearest defender 3 m away', () => {
    expect(isTeammateOpen(gameWithGap(3), 'SG')).toBe(true);
  });

  it('is not open at 2 m', () => {
    expect(isTeammateOpen(gameWithGap(2), 'SG')).toBe(false);
  });

  it('is open at exactly the separation', () => {
    expect(isTeammateOpen(gameWithGap(OPENING_SEPARATION_M), 'SG')).toBe(true);
  });

  it('is not open for an unknown role', () => {
    expect(isTeammateOpen(gameWithGap(3), 'XX' as RoleId)).toBe(false);
  });

  it('honours a custom separation', () => {
    expect(isTeammateOpen(gameWithGap(2), 'SG', 1.5)).toBe(true);
    expect(isTeammateOpen(gameWithGap(3), 'SG', 4)).toBe(false);
  });
});
