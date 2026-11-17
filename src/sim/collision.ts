// Body collision for one fixed step ("soft contact"): every player is a circle on the court plane,
// and overlapping pairs are pushed apart after movement (./step.ts calls this before the
// out-of-bounds check and ball flight, so both see the corrected positions).
//
// Rules:
// - Radius and mass come from GameState.collision.profiles by role (filled in by the content layer;
//   the sim never reads content). A game without a collision setup skips the pass entirely.
// - Practice cones (defense players in defenseMode 'cones') are not bodies: they are scripted,
//   non-interactive markers, so every pair that involves one is skipped.
// - A player is "set" when it holds pivot, or when both its post-movement speed and its intended
//   speed (move intent length * run speed) are <= tuning.setSpeedMps. A set player resists with
//   mass * setMassMultiplier, so a stopped screener holds against a defender running into it. The
//   intent check keeps a runner that is stalled against a body (slow, but still pressing) from
//   counting as set too. "Set" is purely physical: the sim knows nothing about screens or plays.
// - For `iterations` passes over every pair i < j in array order, an overlapping pair is pushed
//   apart along the line between centres, split by inverse resistance. Coincident centres use the
//   fixed normal { x: 1, z: 0 } from the lower-index player to the higher-index one.
// - Positions: a player's total displacement this step (from its position before movement) stays
//   within its sprint top speed * FIXED_DT, and a player that was inside the half court is never
//   pushed out of it (sidelines, baseline, half-court line), so contact cannot cause an
//   out-of-bounds turnover. Push that the cap or the court edge cuts short goes to the other body.
// - Velocity: contact never adds velocity. Each body only loses its own velocity component toward
//   the other body, so its tangential velocity is kept and a runner slides around a set body. A
//   player in contact then changes velocity this step by at most its braking limit
//   (accelerationMps2 * brakingMultiplier * FIXED_DT) from its velocity before movement, so it
//   decelerates into a body instead of stopping dead. Players without contact are untouched. A
//   contacted body on a court edge that stepGame's bounds check enforces loses its outward velocity.
//
// Contact is physical only and never graded or whistled: no events, no rng draws.

import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X, isInBounds } from './court';
import type { CourtPoint, GameState, PlayerState } from './state';
import { FIXED_DT } from './stepper';

/** A player's position and velocity right before this step's movement. */
export interface BodyStart {
  readonly pos: Readonly<CourtPoint>;
  readonly vel: Readonly<CourtPoint>;
}

/** Below this centre distance (m) two bodies count as coincident and use the fixed normal. */
const COINCIDENT_EPSILON_M = 1e-9;

const FIXED_NORMAL: Readonly<CourtPoint> = Object.freeze({ x: 1, z: 0 });

interface Body {
  player: PlayerState;
  radiusM: number;
  /** Inverse resistance. */
  invMass: number;
  /** Inside the half court at the start of the pass: pushes are then clamped to stay inside. */
  inside: boolean;
  /** Position before movement; null when the caller gave no start (no displacement cap). */
  startPos: Readonly<CourtPoint> | null;
  startVel: Readonly<CourtPoint>;
  /** Largest displacement from startPos this step, in m. */
  maxDisplacementM: number;
  /** Post-movement velocity with this step's approaching components removed. */
  desiredVel: CourtPoint;
  contact: boolean;
}

function clampInside(pos: CourtPoint): void {
  pos.x = Math.min(SIDELINE_X, Math.max(-SIDELINE_X, pos.x));
  pos.z = Math.min(HALF_COURT_LINE_Z, Math.max(BASELINE_Z, pos.z));
}

/** Largest t in [0, amount] with |pos + t * dir - start| <= maxM (dir is a unit vector). */
function cappedStep(
  pos: CourtPoint,
  start: Readonly<CourtPoint>,
  dir: CourtPoint,
  amount: number,
  maxM: number,
): number {
  const dx = pos.x - start.x;
  const dz = pos.z - start.z;
  const along = dx * dir.x + dz * dir.z;
  const disc = along * along - (dx * dx + dz * dz) + maxM * maxM;
  const tMax = -along + Math.sqrt(Math.max(0, disc));
  return Math.min(amount, Math.max(0, tMax));
}

/**
 * Moves `body` by up to `amount` along `dir` (within its displacement cap, and clamped inside the
 * court when it started inside) and returns the part of `amount` it could not move.
 */
function pushBody(body: Body, dir: CourtPoint, amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  const { pos } = body.player;
  const step =
    body.startPos === null
      ? amount
      : cappedStep(pos, body.startPos, dir, amount, body.maxDisplacementM);
  const startX = pos.x;
  const startZ = pos.z;
  pos.x += dir.x * step;
  pos.z += dir.z * step;
  if (body.inside) {
    clampInside(pos);
  }
  const moved = (pos.x - startX) * dir.x + (pos.z - startZ) * dir.z;
  return Math.max(0, amount - moved);
}

/** Removes the component of `vel` along `dir` when it is positive (moving toward the other body). */
function removeApproach(vel: CourtPoint, dir: CourtPoint): void {
  const toward = vel.x * dir.x + vel.z * dir.z;
  if (toward > 0) {
    vel.x -= dir.x * toward;
    vel.z -= dir.z * toward;
  }
}

function resolvePair(a: Body, b: Body): void {
  const pa = a.player.pos;
  const pb = b.player.pos;
  const dx = pb.x - pa.x;
  const dz = pb.z - pa.z;
  const dist = Math.hypot(dx, dz);
  const overlap = a.radiusM + b.radiusM - dist;
  if (overlap <= 0) {
    return;
  }
  const n: CourtPoint = dist < COINCIDENT_EPSILON_M ? FIXED_NORMAL : { x: dx / dist, z: dz / dist };
  const shareA = a.invMass / (a.invMass + b.invMass);
  const shareB = 1 - shareA;
  const away: CourtPoint = { x: -n.x, z: -n.z };

  // a moves against the normal, b along it; push a body cannot take goes to the other body.
  const shortA = pushBody(a, away, overlap * shareA);
  const shortB = pushBody(b, n, overlap * shareB + shortA);
  pushBody(a, away, shortB);

  a.contact = true;
  b.contact = true;
  removeApproach(a.desiredVel, n);
  removeApproach(b.desiredVel, away);
}

/** Sets a contacted player's velocity: toward desiredVel, at most the braking limit from start. */
function settleVelocity(body: Body, brakingMultiplier: number): void {
  const { startVel, desiredVel, player } = body;
  const maxDv = player.movement.accelerationMps2 * brakingMultiplier * FIXED_DT;
  const dx = desiredVel.x - startVel.x;
  const dz = desiredVel.z - startVel.z;
  const len = Math.hypot(dx, dz);
  const scale = len > maxDv ? maxDv / len : 1;
  player.vel = { x: startVel.x + dx * scale, z: startVel.z + dz * scale };
  // Never restore velocity out through an edge applyBounds enforces (the holder may leave the
  // sideline and baseline, so only a body that started inside is held there).
  const { pos, vel } = player;
  if (pos.z >= HALF_COURT_LINE_Z && vel.z > 0) {
    vel.z = 0;
  }
  if (body.inside) {
    if ((pos.x >= SIDELINE_X && vel.x > 0) || (pos.x <= -SIDELINE_X && vel.x < 0)) {
      vel.x = 0;
    }
    if (pos.z <= BASELINE_Z && vel.z < 0) {
      vel.z = 0;
    }
  }
}

/**
 * Pushes overlapping players apart. Mutates `state`, which must already be a clone (stepGame's
 * `next`). `start` holds each player's position and velocity before this step's movement, in
 * `state.players` order; without it the current velocities are the start and displacement is not
 * capped (resolving a hand-built state). Does nothing when the game has no collision setup.
 */
export function resolveBodyCollisions(state: GameState, start?: readonly BodyStart[]): void {
  const setup = state.collision;
  if (setup === null) {
    return;
  }
  if (start !== undefined && start.length !== state.players.length) {
    throw new Error(
      `Court Vision: collision start has ${start.length} entries for ${state.players.length} players`,
    );
  }
  const { setSpeedMps, setMassMultiplier, iterations } = setup.tuning;
  const { sprintSpeedMultiplier, brakingMultiplier } = state.movementTuning;
  const bodies: Body[] = [];
  state.players.forEach((player, index) => {
    if (state.defenseMode === 'cones' && player.side === 'defense') {
      return;
    }
    const profile = setup.profiles[player.role];
    const intendedSpeed =
      Math.hypot(player.moveIntent.x, player.moveIntent.z) * player.movement.speedMps;
    const set =
      player.pivotHeld ||
      (Math.hypot(player.vel.x, player.vel.z) <= setSpeedMps && intendedSpeed <= setSpeedMps);
    const resistance = profile.mass * (set ? setMassMultiplier : 1);
    const begin = start?.[index];
    bodies.push({
      player,
      radiusM: profile.radiusM,
      invMass: 1 / resistance,
      inside: isInBounds(player.pos),
      startPos: begin === undefined ? null : begin.pos,
      startVel: begin === undefined ? { ...player.vel } : begin.vel,
      maxDisplacementM: player.movement.speedMps * sprintSpeedMultiplier * FIXED_DT,
      desiredVel: { ...player.vel },
      contact: false,
    });
  });
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        resolvePair(bodies[i]!, bodies[j]!);
      }
    }
  }
  for (const body of bodies) {
    if (body.contact) {
      settleVelocity(body, brakingMultiplier);
    }
  }
}
