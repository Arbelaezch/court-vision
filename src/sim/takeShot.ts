// Shot resolution for the shoot and floater actions. Pure sim code: it works on the cloned `next`
// state inside stepGame and draws randomness only from `next.rng`.
//
// A shot resolves instantly on the action tick (no ball flight, no timing input):
// - the look is rated and the make chance taken from it and the shooter's zone rating
//   (./shooting.ts);
// - blocks: every defender within blockRadiusM (and inside contestRadiusM) whose reach + jump gets
//   to the shot's release height draws one score, in ascending id: closeness + rating term + one
//   seeded jitter draw. The lowest id at or above blockThreshold blocks and takes the ball, which
//   is a `mistake` turnover;
// - otherwise one make draw decides the shot and the ball goes dead. A Bad look also emits
//   `runUnsuccessful`, made or missed.
// Randomness order: block draws first, then the make draw (only when not blocked).

import { RIM_CENTER } from './court';
import type { GameEvent } from './events';
import { contestingOpponents } from './opponents';
import { nextFloat, nextRange } from './rng';
import {
  SHOT_REASONS,
  chooseShotType,
  rateLook,
  shotMakeChance,
  shotReleaseHeight,
} from './shooting';
import type { CourtPoint, GameState, PlayerState, ShootingSetup, ShotType } from './state';

function horizontalDistance(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function findPlayer(state: GameState, id: number): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (player === undefined) {
    throw new Error(`Court Vision: player ${id} not found in game state`);
  }
  return player;
}

/** Every eligible defender draws once, in ascending id; returns the lowest blocking id or null. */
function resolveBlock(
  next: GameState,
  shooting: ShootingSetup,
  shooter: PlayerState,
  shotType: ShotType,
  zoneRating: number,
): number | null {
  const { profiles, tuning } = shooting;
  const releaseHeight = shotReleaseHeight(shotType, tuning);
  let blocker: number | null = null;
  for (const defender of contestingOpponents(next, shooter.side)) {
    const profile = profiles[defender.role];
    const d = horizontalDistance(defender.pos, shooter.pos);
    if (
      d > tuning.blockRadiusM ||
      d >= tuning.contestRadiusM ||
      profile.reachM + tuning.contestJumpM < releaseHeight
    ) {
      continue;
    }
    const closeness = 1 - d / tuning.blockRadiusM;
    const ratingTerm = (tuning.blockRatingWeight * (profile.defensiveAwareness - zoneRating)) / 100;
    const jitter = nextRange(next.rng, -tuning.blockJitter, tuning.blockJitter);
    if (closeness + ratingTerm + jitter >= tuning.blockThreshold && blocker === null) {
      blocker = defender.id;
    }
  }
  return blocker;
}

/**
 * Takes a shot (or a floater) with the controlled player. Throws when the game has no shooting
 * setup; ignores the action when the controlled player does not hold the ball or a floater is
 * beyond floaterMaxDistanceM of the rim.
 */
export function takeShot(
  next: GameState,
  action: 'shoot' | 'floater',
  eventTick: number,
): GameEvent[] {
  const shooting = next.shooting;
  if (shooting === null) {
    throw new Error('Court Vision: shoot action needs a game created with a shooting setup');
  }
  const shooter = findPlayer(next, next.controlledPlayerId);
  if (next.ball.kind !== 'held' || next.ball.holderId !== shooter.id) {
    return [];
  }
  const { profiles, tuning } = shooting;
  if (
    action === 'floater' &&
    horizontalDistance(shooter.pos, RIM_CENTER) > tuning.floaterMaxDistanceM
  ) {
    return [];
  }
  const shotType: ShotType =
    action === 'floater' ? 'floater' : chooseShotType(next, shooter.id, eventTick);
  const rating = rateLook(next, shooter.id, shotType, eventTick);
  const zoneRating = profiles[shooter.role].shooting[rating.zone];
  const makeChance = shotMakeChance(rating.look, zoneRating, tuning);
  const base = {
    type: 'shotResolved',
    tick: eventTick,
    shooterId: shooter.id,
    shotType,
    zone: rating.zone,
    look: rating.look,
    makeChance,
  } as const;

  const blockerId = resolveBlock(next, shooting, shooter, shotType, zoneRating);
  if (blockerId !== null) {
    next.ball = { kind: 'held', holderId: blockerId };
    next.lastCatch = null;
    return [
      { ...base, made: false, blockerId, reason: SHOT_REASONS.contested },
      { type: 'mistake', tick: eventTick, kind: 'turnover', reason: SHOT_REASONS.contested },
    ];
  }

  const made = nextFloat(next.rng) < makeChance;
  next.ball = { kind: 'dead', shooterId: shooter.id, made };
  next.lastCatch = null;
  const events: GameEvent[] = [{ ...base, made, blockerId: null, reason: rating.reason }];
  if (rating.look === 'bad') {
    events.push({ type: 'runUnsuccessful', tick: eventTick, reason: rating.reason });
  }
  return events;
}
