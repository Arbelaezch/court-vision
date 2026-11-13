// The opponents that may intercept, contest or block a play by `side`. Shared by passing,
// shot rating and blocks so every interaction treats Practice cones the same way.

import type { GameState, PlayerState, TeamSide } from './state';

/**
 * Players not on `side`, in ascending id (the order every seeded draw runs in). In 'cones' defense
 * mode the defense players are Practice cones: they are dropped, so they never intercept, contest
 * or block.
 */
export function contestingOpponents(state: GameState, side: TeamSide): PlayerState[] {
  return state.players
    .filter((p) => p.side !== side && !(state.defenseMode === 'cones' && p.side === 'defense'))
    .sort((a, b) => a.id - b.id);
}
