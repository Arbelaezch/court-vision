// Passing: the pass action, ball flight, catch and interception. Pure sim code: it works on the
// cloned `next` state inside stepGame and draws randomness only from `next.rng`.
//
// Each defender may threaten the pass in two zones:
// - lane: decided at release (defenders do not react mid-flight yet). The planned path runs from
//   the passer to the receiver's predicted arrival spot (current velocity over the flight, clamped
//   to the court) and is sampled every PASS_SAMPLE_SPACING_M, away from that spot, where the ball
//   height is inside the defender's contest band. Only defenders alongside the path (projection
//   strictly between passer and arrival spot) count, so a defender behind the passer never
//   intercepts a pass thrown away from them;
// - catch: decided on the arrival tick around the receiver's actual position, when the arrival
//   height is inside the band.
// Each threat scores closeness + rating term + one seeded jitter draw; a score at or above the
// threshold intercepts. The earliest intercepting lane threat wins; the catch zone is only checked
// when no lane threat intercepted. Ties go to the lowest defender id.

import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X } from './court';
import type { GameEvent } from './events';
import { contestingOpponents } from './opponents';
import { nextRange } from './rng';
import { PASS_TYPES } from './state';
import type {
  CourtPoint,
  GameState,
  PassFlightTuning,
  PassInterception,
  PassTuning,
  PassType,
  PlayerState,
} from './state';
import { FIXED_DT, SIM_HZ } from './stepper';

export const PASS_TURNOVER_REASONS = {
  crowdedLane: 'Passed into a crowded lane',
  coveredReceiver: 'Passed to a covered teammate',
  coveredLob: 'Lobbed to a covered teammate',
} as const;

/** Spacing of the path samples used for lane interceptions, m. */
export const PASS_SAMPLE_SPACING_M = 0.1;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function horizontalDistance(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Ball height (m) at path fraction t (clamped to [0, 1]) for the pass type. */
export function passHeightAt(type: PassType, t: number, tuning: PassTuning): number {
  const p = clamp01(t);
  switch (type) {
    case 'chestPass':
    case 'handOff': {
      const flight = tuning[type];
      return lerp(flight.releaseHeightM, flight.catchHeightM, p);
    }
    case 'bouncePass': {
      const { releaseHeightM, catchHeightM, bounceAtFraction: b } = tuning.bouncePass;
      return p < b ? releaseHeightM * (1 - p / b) : (catchHeightM * (p - b)) / (1 - b);
    }
    case 'lob': {
      const { releaseHeightM, catchHeightM, apexHeightM } = tuning.lob;
      const middle = (releaseHeightM + catchHeightM) / 2;
      return lerp(releaseHeightM, catchHeightM, p) + 4 * (apexHeightM - middle) * p * (1 - p);
    }
    default: {
      const unhandled: never = type;
      throw new Error(`Court Vision: unknown pass type ${String(unhandled)}`);
    }
  }
}

function findPlayer(state: GameState, id: number): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (player === undefined) {
    throw new Error(`Court Vision: player ${id} not found in game state`);
  }
  return player;
}

interface Threat {
  defenderId: number;
  t: number;
  reason: string;
}

/** Contest-band check and rating term for one defender. */
function defenderContest(
  tuning: PassTuning,
  profile: { reachM: number; defensiveAwareness: number },
): { inBand: (y: number) => boolean; ratingTerm: (rating: number) => number } {
  const bandLow = tuning.contestLowM;
  const bandHigh = profile.reachM + tuning.contestJumpM;
  return {
    inBand: (y) => y >= bandLow && y <= bandHigh,
    ratingTerm: (rating) => (tuning.ratingWeight * (profile.defensiveAwareness - rating)) / 100,
  };
}

/** Where the receiver will be after `ticks` steps at their current velocity, clamped to the court. */
function predictArrivalSpot(receiver: PlayerState, ticks: number): CourtPoint {
  const seconds = ticks * FIXED_DT;
  return {
    x: Math.min(SIDELINE_X, Math.max(-SIDELINE_X, receiver.pos.x + receiver.vel.x * seconds)),
    z: Math.min(HALF_COURT_LINE_Z, Math.max(BASELINE_Z, receiver.pos.z + receiver.vel.z * seconds)),
  };
}

/** Path fraction of `p` projected onto the segment a -> b (unclamped). */
function projectionFraction(a: CourtPoint, b: CourtPoint, p: CourtPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) {
    return 0;
  }
  return ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq;
}

/** Lane interception, decided at release against the path to the predicted arrival spot. */
function resolveLaneInterception(
  next: GameState,
  passType: PassType,
  passer: PlayerState,
  arrival: CourtPoint,
  flightTicks: number,
): PassInterception | null {
  const passing = next.passing;
  if (passing === null) {
    throw new Error('Court Vision: pass needs a passing setup');
  }
  const { tuning, profiles } = passing;
  const flight: PassFlightTuning = tuning[passType];
  const length = horizontalDistance(passer.pos, arrival);
  const sampleCount = Math.max(1, Math.ceil(length / PASS_SAMPLE_SPACING_M));
  const samples: { point: CourtPoint; t: number; y: number }[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const point = {
      x: lerp(passer.pos.x, arrival.x, t),
      z: lerp(passer.pos.z, arrival.z, t),
    };
    if (horizontalDistance(point, arrival) > flight.catchRadiusM) {
      samples.push({ point, t, y: passHeightAt(passType, t, tuning) });
    }
  }

  const passerRating = profiles[passer.role].passing;

  // Defenders run in ascending id, so a strict `<` keeps the lowest id on equal progress.
  let best: Threat | null = null;
  for (const defender of contestingOpponents(next, passer.side)) {
    const along = projectionFraction(passer.pos, arrival, defender.pos);
    if (along <= 0 || along >= 1) {
      continue;
    }
    const { inBand, ratingTerm } = defenderContest(tuning, profiles[defender.role]);
    let laneMin = Infinity;
    let laneT = 0;
    for (const sample of samples) {
      if (!inBand(sample.y)) {
        continue;
      }
      const d = horizontalDistance(defender.pos, sample.point);
      if (d < laneMin) {
        laneMin = d;
        laneT = sample.t;
      }
    }
    if (laneMin < tuning.laneRadiusM) {
      const closeness = 1 - laneMin / tuning.laneRadiusM;
      const jitter = nextRange(next.rng, -tuning.jitter, tuning.jitter);
      if (closeness + ratingTerm(passerRating) + jitter >= tuning.interceptThreshold) {
        if (best === null || laneT < best.t) {
          best = { defenderId: defender.id, t: laneT, reason: PASS_TURNOVER_REASONS.crowdedLane };
        }
      }
    }
  }

  if (best === null) {
    return null;
  }
  return {
    defenderId: best.defenderId,
    atTick: Math.max(1, Math.ceil(best.t * flightTicks)),
    reason: best.reason,
  };
}

/** Catch-zone interception on the arrival tick, around the receiver's actual position. */
function resolveCatchInterception(
  next: GameState,
  passType: PassType,
  receiver: PlayerState,
): { defenderId: number; reason: string } | null {
  const passing = next.passing;
  if (passing === null) {
    throw new Error('Court Vision: pass needs a passing setup');
  }
  const { tuning, profiles } = passing;
  const flight: PassFlightTuning = tuning[passType];
  const receiverRating = profiles[receiver.role].ballSecurity;
  let winner: number | null = null;
  // Every defender in the zone draws, in ascending id; the lowest intercepting id wins.
  for (const defender of contestingOpponents(next, receiver.side)) {
    const { inBand, ratingTerm } = defenderContest(tuning, profiles[defender.role]);
    const catchDistance = horizontalDistance(defender.pos, receiver.pos);
    if (inBand(flight.catchHeightM) && catchDistance < flight.catchRadiusM) {
      const closeness = 1 - catchDistance / flight.catchRadiusM;
      const jitter = nextRange(next.rng, -tuning.jitter, tuning.jitter);
      if (
        closeness + ratingTerm(receiverRating) + jitter >= tuning.interceptThreshold &&
        winner === null
      ) {
        winner = defender.id;
      }
    }
  }
  if (winner === null) {
    return null;
  }
  return {
    defenderId: winner,
    reason:
      passType === 'lob' ? PASS_TURNOVER_REASONS.coveredLob : PASS_TURNOVER_REASONS.coveredReceiver,
  };
}

/**
 * Starts a pass from `passerId` (default: the controlled player; AI teammates pass through a
 * `pass` PlayerCommand). Throws on caller bugs (unknown pass type, unknown passer, invalid target,
 * no passing setup); ignores the pass when the passer does not hold the ball or a hand-off target
 * is out of range.
 */
export function startPass(
  next: GameState,
  passType: PassType,
  targetId: number,
  passerId: number = next.controlledPlayerId,
): void {
  if (!(PASS_TYPES as readonly unknown[]).includes(passType)) {
    throw new Error(`Court Vision: unknown pass type ${String(passType)}`);
  }
  const passer = findPlayer(next, passerId);
  if (!Number.isInteger(targetId)) {
    throw new Error(`Court Vision: pass targetId must be an integer, got ${targetId}`);
  }
  const receiver = next.players.find((p) => p.id === targetId);
  if (receiver === undefined) {
    throw new Error(`Court Vision: pass target ${targetId} not found in game state`);
  }
  if (receiver.id === passer.id) {
    throw new Error(`Court Vision: player ${passer.id} cannot pass to themselves`);
  }
  if (receiver.side !== passer.side) {
    throw new Error(`Court Vision: pass target ${targetId} is not a teammate of ${passer.id}`);
  }
  const passing = next.passing;
  if (passing === null) {
    throw new Error('Court Vision: pass action needs a game created with a passing setup');
  }
  if (next.ball.kind !== 'held' || next.ball.holderId !== passer.id) {
    return;
  }
  const length = horizontalDistance(passer.pos, receiver.pos);
  if (passType === 'handOff' && length > passing.tuning.handOff.maxDistanceM) {
    return;
  }

  const flight = passing.tuning[passType];
  const ticksTo = (spot: CourtPoint): number =>
    Math.max(1, Math.ceil((horizontalDistance(passer.pos, spot) / flight.speedMps) * SIM_HZ));
  // Lead the receiver: time the flight to where they will be, refined once from the first guess.
  const flightTicks = ticksTo(predictArrivalSpot(receiver, ticksTo(receiver.pos)));
  const arrival = predictArrivalSpot(receiver, flightTicks);
  const interception = resolveLaneInterception(next, passType, passer, arrival, flightTicks);
  const origin = { x: passer.pos.x, y: flight.releaseHeightM, z: passer.pos.z };
  next.ball = {
    kind: 'inFlight',
    pos: { ...origin },
    vel: { x: 0, y: 0, z: 0 },
    fromId: passer.id,
    targetId: receiver.id,
    passType,
    origin,
    elapsedTicks: 0,
    flightTicks,
    interception,
  };
}

/**
 * Advances an in-flight ball one tick toward the receiver's current position. On the interception
 * tick the defender takes the ball (turnover); on arrival a covering defender may take it,
 * otherwise the receiver catches it. No-op when held.
 */
export function advanceBallFlight(next: GameState, eventTick: number): GameEvent[] {
  const ball = next.ball;
  if (ball.kind !== 'inFlight') {
    return [];
  }
  const passing = next.passing;
  if (passing === null) {
    throw new Error('Court Vision: ball in flight without a passing setup');
  }
  const receiver = findPlayer(next, ball.targetId);
  ball.elapsedTicks += 1;
  const p = Math.min(1, ball.elapsedTicks / ball.flightTicks);
  const prev = ball.pos;
  const pos = {
    x: lerp(ball.origin.x, receiver.pos.x, p),
    y: passHeightAt(ball.passType, p, passing.tuning),
    z: lerp(ball.origin.z, receiver.pos.z, p),
  };
  ball.vel = {
    x: (pos.x - prev.x) / FIXED_DT,
    y: (pos.y - prev.y) / FIXED_DT,
    z: (pos.z - prev.z) / FIXED_DT,
  };
  ball.pos = pos;

  if (ball.interception !== null && ball.elapsedTicks >= ball.interception.atTick) {
    const { defenderId, reason } = ball.interception;
    next.ball = { kind: 'held', holderId: defenderId };
    next.lastCatch = null;
    return [{ type: 'mistake', tick: eventTick, kind: 'turnover', reason }];
  }
  if (ball.elapsedTicks >= ball.flightTicks) {
    const covered = resolveCatchInterception(next, ball.passType, receiver);
    if (covered !== null) {
      next.ball = { kind: 'held', holderId: covered.defenderId };
      next.lastCatch = null;
      return [{ type: 'mistake', tick: eventTick, kind: 'turnover', reason: covered.reason }];
    }
    const set = Math.hypot(receiver.vel.x, receiver.vel.z) <= passing.tuning.setSpeedMps;
    next.ball = { kind: 'held', holderId: receiver.id };
    next.lastCatch = { playerId: receiver.id, passType: ball.passType, tick: eventTick, set };
    return [
      {
        type: 'passCompleted',
        tick: eventTick,
        passType: ball.passType,
        passerId: ball.fromId,
        receiverId: receiver.id,
        receiverSet: set,
      },
    ];
  }
  return [];
}
