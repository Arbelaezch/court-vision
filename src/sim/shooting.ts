// Shooting helpers: shot zone, shot-type choice, look quality and make chance. Pure sim code: the
// helpers read state, never mutate it, and draw no randomness (the shot resolver does that).
//
// Look score = 1 - sum(penalties), clamped to [0, 1]; Great at or above greatMinScore, Good at or
// above goodMinScore, otherwise Bad. Penalties:
// - contest: the nearest defender (horizontal distance d, lowest id on ties) inside contestRadiusM;
// - closingOut: the extra contest when that defender closes, as if closingLeadS seconds nearer;
// - both are scaled by beatenDefenderFactor when that defender is farther from the rim than the
//   shooter (an advantage created);
// - rimContest (layup, floater): the tallest contest from defenders within rimContestRadiusM,
//   from reach + jump against the shot's release height, so a floater rises over a big;
// - offBalance (jump shots): moving faster than offBalanceSpeedMps, or a recent unset catch;
// - outOfRange: beyond maxRangeM, or a zone rating below rangeRatingFloor;
// - floater: a fixed penalty, so an open layup still beats an open floater.
// The reason is 'Open shot' for a Great look, otherwise the largest penalty's reason (ties in the
// order above).

import { RIM_CENTER, isBeyondArc } from './court';
import { contestingOpponents } from './opponents';
import type {
  CourtPoint,
  GameState,
  LookQuality,
  PlayerState,
  ShotTuning,
  ShotType,
  ShotZone,
} from './state';

export const SHOT_REASONS = {
  open: 'Open shot',
  contested: 'Contested shot',
  closingOut: 'Defender closing out',
  rimContest: 'Contested at the rim by a bigger defender',
  offBalance: 'Off-balance shot',
  outOfRange: 'Shot out of range',
  floater: 'Tough floater',
} as const;

export interface LookRating {
  look: LookQuality;
  /** Look score in [0, 1]. */
  score: number;
  reason: string;
  zone: ShotZone;
  /** Horizontal distance from the shooter to the rim centre, m. */
  distanceM: number;
  /** Nearest opponent (lowest id on ties), or null when there is none. */
  nearestDefenderId: number | null;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function horizontalDistance(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function speedOf(p: PlayerState): number {
  return Math.hypot(p.vel.x, p.vel.z);
}

function findPlayer(state: GameState, id: number): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (player === undefined) {
    throw new Error(`Court Vision: player ${id} not found in game state`);
  }
  return player;
}

function requireShooting(state: GameState): NonNullable<GameState['shooting']> {
  if (state.shooting === null) {
    throw new Error('Court Vision: rating a shot needs a game created with a shooting setup');
  }
  return state.shooting;
}

function isJumpShot(type: ShotType): boolean {
  return type !== 'layup' && type !== 'floater';
}

/** `rim` within rimZoneRadiusM of the rim centre, `three` beyond the arc, otherwise `midRange`. */
export function shotZoneAt(p: CourtPoint, tuning: ShotTuning): ShotZone {
  if (horizontalDistance(p, RIM_CENTER) <= tuning.rimZoneRadiusM) {
    return 'rim';
  }
  return isBeyondArc(p) ? 'three' : 'midRange';
}

/** Ball height at release for the shot type, m. */
export function shotReleaseHeight(type: ShotType, tuning: ShotTuning): number {
  switch (type) {
    case 'layup':
      return tuning.layupReleaseHeightM;
    case 'floater':
      return tuning.floaterReleaseHeightM;
    case 'jumper':
    case 'three':
    case 'pullUp':
    case 'catchAndShoot':
      return tuning.jumpShotReleaseHeightM;
    default: {
      const unhandled: never = type;
      throw new Error(`Court Vision: unknown shot type ${String(unhandled)}`);
    }
  }
}

/** True when the shooter caught the ball within the catch-and-shoot window before eventTick. */
function caughtRecently(state: GameState, shooterId: number, eventTick: number): boolean {
  const { lastCatch } = state;
  if (lastCatch === null || lastCatch.playerId !== shooterId) {
    return false;
  }
  return eventTick - lastCatch.tick <= requireShooting(state).tuning.catchAndShootWindowTicks;
}

/**
 * The shot the shoot action takes: a layup at the rim, otherwise catch-and-shoot after a recent
 * set catch, a pull-up off the dribble, a three beyond the arc, or a jumper.
 */
export function chooseShotType(state: GameState, shooterId: number, eventTick: number): ShotType {
  const { tuning } = requireShooting(state);
  const shooter = findPlayer(state, shooterId);
  if (horizontalDistance(shooter.pos, RIM_CENTER) <= tuning.rimZoneRadiusM) {
    return 'layup';
  }
  if (caughtRecently(state, shooterId, eventTick) && state.lastCatch?.set === true) {
    return 'catchAndShoot';
  }
  if (speedOf(shooter) > tuning.dribbleSpeedMps) {
    return 'pullUp';
  }
  return isBeyondArc(shooter.pos) ? 'three' : 'jumper';
}

// Penalty keys in reason tie-break order.
const PENALTY_ORDER = [
  'contested',
  'closingOut',
  'rimContest',
  'offBalance',
  'outOfRange',
  'floater',
] as const;
type PenaltyKey = (typeof PENALTY_ORDER)[number];

function lookFromScore(score: number, tuning: ShotTuning): LookQuality {
  if (score >= tuning.greatMinScore) {
    return 'great';
  }
  return score >= tuning.goodMinScore ? 'good' : 'bad';
}

/** Speed of `defender` toward `target` (0 when moving away or on top of it), m/s. */
function closingSpeedToward(defender: PlayerState, target: CourtPoint): number {
  const d = horizontalDistance(defender.pos, target);
  if (d === 0) {
    return 0;
  }
  const along =
    defender.vel.x * (target.x - defender.pos.x) + defender.vel.z * (target.z - defender.pos.z);
  return Math.max(0, along / d);
}

/** Contest penalty from a defender at distance d (0 at or beyond contestRadiusM). */
function contestAt(d: number, tuning: ShotTuning): number {
  if (d >= tuning.contestRadiusM) {
    return 0;
  }
  return tuning.contestWeight * (1 - d / tuning.contestRadiusM);
}

/** Scores the look for `shotType` taken by `shooterId` on `eventTick`. */
export function rateLook(
  state: GameState,
  shooterId: number,
  shotType: ShotType,
  eventTick: number,
): LookRating {
  const { profiles, tuning } = requireShooting(state);
  const shooter = findPlayer(state, shooterId);
  const distanceM = horizontalDistance(shooter.pos, RIM_CENTER);
  const zone = shotZoneAt(shooter.pos, tuning);
  const zoneRating = profiles[shooter.role].shooting[zone];
  const releaseHeight = shotReleaseHeight(shotType, tuning);
  const opponents = contestingOpponents(state, shooter.side);

  const penalties: Record<PenaltyKey, number> = {
    contested: 0,
    closingOut: 0,
    rimContest: 0,
    offBalance: 0,
    outOfRange: 0,
    floater: 0,
  };

  let nearest: PlayerState | null = null;
  let nearestD = Infinity;
  for (const defender of opponents) {
    const d = horizontalDistance(defender.pos, shooter.pos);
    if (d < nearestD) {
      nearest = defender;
      nearestD = d;
    }
  }

  if (nearest !== null) {
    const closingSpeed = closingSpeedToward(nearest, shooter.pos);
    const effD = Math.max(0, nearestD - closingSpeed * tuning.closingLeadS);
    const contest = contestAt(nearestD, tuning);
    const closingTotal = contestAt(effD, tuning);
    const beaten = horizontalDistance(nearest.pos, RIM_CENTER) > distanceM;
    const factor = beaten ? tuning.beatenDefenderFactor : 1;
    penalties.contested = contest * factor;
    penalties.closingOut = Math.max(0, closingTotal - contest) * factor;
  }

  if (!isJumpShot(shotType)) {
    for (const defender of opponents) {
      if (horizontalDistance(defender.pos, shooter.pos) > tuning.rimContestRadiusM) {
        continue;
      }
      const top = profiles[defender.role].reachM + tuning.contestJumpM;
      const value =
        tuning.rimContestWeight * clamp01(0.5 + (top - releaseHeight) / tuning.rimContestSpanM);
      penalties.rimContest = Math.max(penalties.rimContest, value);
    }
  } else {
    const caught = caughtRecently(state, shooterId, eventTick);
    const unsetCatch = caught && state.lastCatch?.set === false;
    if (speedOf(shooter) > tuning.offBalanceSpeedMps || unsetCatch) {
      penalties.offBalance = tuning.offBalancePenalty;
    }
  }

  if (distanceM > tuning.maxRangeM || zoneRating < tuning.rangeRatingFloor) {
    penalties.outOfRange = tuning.outOfRangePenalty;
  }
  if (shotType === 'floater') {
    penalties.floater = tuning.floaterPenalty;
  }

  let sum = 0;
  let largest: PenaltyKey = 'contested';
  for (const key of PENALTY_ORDER) {
    sum += penalties[key];
    if (penalties[key] > penalties[largest]) {
      largest = key;
    }
  }
  const score = clamp01(1 - sum);
  const look = lookFromScore(score, tuning);
  return {
    look,
    score,
    reason: look === 'great' ? SHOT_REASONS.open : SHOT_REASONS[largest],
    zone,
    distanceM,
    nearestDefenderId: nearest === null ? null : nearest.id,
  };
}

function baseMakeChance(look: LookQuality, tuning: ShotTuning): number {
  switch (look) {
    case 'great':
      return tuning.greatMakeChance;
    case 'good':
      return tuning.goodMakeChance;
    case 'bad':
      return tuning.badMakeChance;
    default: {
      const unhandled: never = look;
      throw new Error(`Court Vision: unknown look quality ${String(unhandled)}`);
    }
  }
}

/** Make chance for a look, shifted by the shooter's zone rating and clamped to the tuning bounds. */
export function shotMakeChance(look: LookQuality, zoneRating: number, tuning: ShotTuning): number {
  const shift = (tuning.zoneRatingWeight * (zoneRating - 50)) / 100;
  const shifted = baseMakeChance(look, tuning) + shift;
  return Math.min(tuning.maxMakeChance, Math.max(tuning.minMakeChance, shifted));
}
