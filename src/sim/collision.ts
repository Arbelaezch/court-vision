// Body collision for one fixed step: every player is a circle on the court plane, and overlapping
// pairs are pushed apart after movement (./step.ts calls this before the out-of-bounds check and
// ball flight, so both see the corrected positions).
//
// Rules:
// - Radius and mass come from GameState.collision.profiles by role (filled in by the content layer;
//   the sim never reads content). A game without a collision setup skips the pass entirely.
// - A player is "set" when it holds pivot, or when both its post-movement speed and its intended
//   speed (move intent length * run speed) are <= tuning.setSpeedMps. A set player resists with
//   mass * setMassMultiplier, so a stopped screener holds against a defender running into it. The
//   intent check keeps a runner that is stalled against a body (slow, but still pressing) from
//   counting as set too. "Set" is purely physical: the sim knows nothing about screens or plays.
// - Practice cones (defense players in defenseMode 'cones') are immovable: place commands teleport
//   them, and moving them would make them flicker back. Two immovable bodies split the push 50/50.
// - For `iterations` passes over every pair i < j in array order, an overlapping pair is pushed
//   apart along the line between centres, split by inverse resistance. Coincident centres use the
//   fixed normal { x: 1, z: 0 } from the lower-index player to the higher-index one.
// - The approaching normal component of the pair's relative velocity is removed with the same
//   shares (inelastic along the normal). Tangential velocity is kept, so a player meeting a set
//   body slides around it.
// - A push never moves a player that was inside the half court out of it (positions are clamped to
//   the sidelines, baseline and half-court line), so contact cannot cause an out-of-bounds turnover.
//   Push that a clamp cuts short is handed to the other body, and velocity added by contact is cut
//   so it alone cannot carry an inside player out on the next step.
//
// Contact is physical only and never graded or whistled: no events, no rng draws.

import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X, isInBounds } from './court';
import type { CourtPoint, GameState, PlayerState } from './state';
import { FIXED_DT } from './stepper';

/** Below this centre distance (m) two bodies count as coincident and use the fixed normal. */
const COINCIDENT_EPSILON_M = 1e-9;

const FIXED_NORMAL: Readonly<CourtPoint> = Object.freeze({ x: 1, z: 0 });

interface Body {
  player: PlayerState;
  radiusM: number;
  /** Inverse resistance; 0 for an immovable body. */
  invMass: number;
  immovable: boolean;
  /** Inside the half court at the start of the pass: pushes are then clamped to stay inside. */
  inside: boolean;
}

function clampInside(body: Body): void {
  const { pos, vel } = body.player;
  if (pos.x > SIDELINE_X) {
    pos.x = SIDELINE_X;
    vel.x = Math.min(vel.x, 0);
  } else if (pos.x < -SIDELINE_X) {
    pos.x = -SIDELINE_X;
    vel.x = Math.max(vel.x, 0);
  }
  if (pos.z > HALF_COURT_LINE_Z) {
    pos.z = HALF_COURT_LINE_Z;
    vel.z = Math.min(vel.z, 0);
  } else if (pos.z < BASELINE_Z) {
    pos.z = BASELINE_Z;
    vel.z = Math.max(vel.z, 0);
  }
}

// Cuts velocity added by contact (dv, on one axis) so that it alone cannot carry the player past
// [lo, hi] on the next step; the player's own velocity is left alone.
function limitAxis(pos: number, vel: number, dv: number, lo: number, hi: number): number {
  const ahead = pos + vel * FIXED_DT;
  if (dv > 0 && ahead > hi) {
    return vel - Math.min(dv, (ahead - hi) / FIXED_DT);
  }
  if (dv < 0 && ahead < lo) {
    return vel + Math.min(-dv, (lo - ahead) / FIXED_DT);
  }
  return vel;
}

/** Adds contact velocity to an inside body without letting it carry the body out next step. */
function addContactVelocity(body: Body, dvx: number, dvz: number): void {
  const { pos, vel } = body.player;
  vel.x += dvx;
  vel.z += dvz;
  if (!body.inside) {
    return;
  }
  vel.x = limitAxis(pos.x, vel.x, dvx, -SIDELINE_X, SIDELINE_X);
  vel.z = limitAxis(pos.z, vel.z, dvz, BASELINE_Z, HALF_COURT_LINE_Z);
}

/**
 * Moves `body` by `amount` along `dir` (clamped inside the court when it started inside) and
 * returns the part of `amount` it could not move.
 */
function pushBody(body: Body, dir: CourtPoint, amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  const { pos } = body.player;
  const startX = pos.x;
  const startZ = pos.z;
  pos.x += dir.x * amount;
  pos.z += dir.z * amount;
  if (body.inside) {
    clampInside(body);
  }
  const moved = (pos.x - startX) * dir.x + (pos.z - startZ) * dir.z;
  return Math.max(0, amount - moved);
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
  const bothImmovable = a.immovable && b.immovable;
  const invSum = a.invMass + b.invMass;
  const shareA = bothImmovable || invSum === 0 ? 0.5 : a.invMass / invSum;
  const shareB = 1 - shareA;
  const canMoveA = bothImmovable || !a.immovable;
  const canMoveB = bothImmovable || !b.immovable;
  const away: CourtPoint = { x: -n.x, z: -n.z };

  // a moves against the normal, b along it; push a clamp cuts short goes to the other body.
  const shortA = pushBody(a, away, overlap * shareA);
  const shortB = pushBody(b, n, overlap * shareB + (canMoveB ? shortA : 0));
  if (canMoveA) {
    pushBody(a, away, shortB);
  }

  // Remove the approaching normal component of the relative velocity (b relative to a).
  const va = a.player.vel;
  const vb = b.player.vel;
  const vn = (vb.x - va.x) * n.x + (vb.z - va.z) * n.z;
  if (vn < 0) {
    addContactVelocity(a, n.x * vn * shareA, n.z * vn * shareA);
    addContactVelocity(b, -n.x * vn * shareB, -n.z * vn * shareB);
  }
}

/**
 * Pushes overlapping players apart. Mutates `state`, which must already be a clone (stepGame's
 * `next`). Does nothing when the game has no collision setup.
 */
export function resolveBodyCollisions(state: GameState): void {
  const setup = state.collision;
  if (setup === null) {
    return;
  }
  const { setSpeedMps, setMassMultiplier, iterations } = setup.tuning;
  const bodies: Body[] = state.players.map((player) => {
    const profile = setup.profiles[player.role];
    const immovable = state.defenseMode === 'cones' && player.side === 'defense';
    const intendedSpeed =
      Math.hypot(player.moveIntent.x, player.moveIntent.z) * player.movement.speedMps;
    const set =
      player.pivotHeld ||
      (Math.hypot(player.vel.x, player.vel.z) <= setSpeedMps && intendedSpeed <= setSpeedMps);
    const resistance = profile.mass * (set ? setMassMultiplier : 1);
    return {
      player,
      radiusM: profile.radiusM,
      invMass: immovable ? 0 : 1 / resistance,
      immovable,
      inside: isInBounds(player.pos),
    };
  });
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        resolvePair(bodies[i]!, bodies[j]!);
      }
    }
  }
}
