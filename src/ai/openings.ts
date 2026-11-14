// "The opening exists" (Scrimmage decision-cue gating, assumption A3): a teammate is open when every
// defender is at least OPENING_SEPARATION_M away from them on the court plane (x, z). Pure and
// headless; the app layer uses it to reveal decision cues before the cue delay runs out.
import type { GameState, RoleId } from '../sim';

/** Minimum distance from every defender for a teammate to count as open, m. */
export const OPENING_SEPARATION_M = 2.5;

export function isTeammateOpen(
  game: GameState,
  role: RoleId,
  separationM = OPENING_SEPARATION_M,
): boolean {
  const mate = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (mate === undefined) return false;
  return game.players
    .filter((p) => p.side === 'defense')
    .every((d) => Math.hypot(d.pos.x - mate.pos.x, d.pos.z - mate.pos.z) >= separationM);
}
