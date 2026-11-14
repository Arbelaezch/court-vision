// Teammate spacing helpers: keep AI teammates out of the human player's lane to the rim and
// apart from each other. Pure and deterministic: no randomness, no clock, no input mutation.

import { BASELINE_Z, HALF_COURT_LINE_Z, RIM_CENTER, SIDELINE_X, type CourtPoint } from '../sim';

/** Half-width of the lane (human player to rim) AI teammates stay out of, m. */
export const PG_LANE_HALF_WIDTH_M = 1.2;
/** Extra clearance beyond the lane half-width when moving a target out of the lane, m. */
export const LANE_CLEAR_MARGIN_M = 0.3;
/** Teammates closer than this push each other apart, m. */
export const SEPARATION_RADIUS_M = 1.0;
/** Push strength at zero distance (steer units; the sim clamps the total to 1). */
export const SEPARATION_GAIN = 1.5;

/** Horizontal distance from p to segment a-b. */
export function distanceToSegment(p: CourtPoint, a: CourtPoint, b: CourtPoint): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lengthSq));
  return Math.hypot(p.x - (a.x + t * abx), p.z - (a.z + t * abz));
}

function clampToCourt(p: CourtPoint): CourtPoint {
  return {
    x: Math.min(SIDELINE_X, Math.max(-SIDELINE_X, p.x)),
    z: Math.min(HALF_COURT_LINE_Z, Math.max(BASELINE_Z, p.z)),
  };
}

/**
 * Target moved perpendicular out of the lane (from `laneFrom` to RIM_CENTER) to
 * PG_LANE_HALF_WIDTH_M + LANE_CLEAR_MARGIN_M, on the side `self` is on (+x on a tie), clamped
 * inside the court; unchanged if already outside the lane.
 */
export function clearOfLane(
  target: CourtPoint,
  self: CourtPoint,
  laneFrom: CourtPoint,
): CourtPoint {
  const clearance = PG_LANE_HALF_WIDTH_M + LANE_CLEAR_MARGIN_M;
  if (distanceToSegment(target, laneFrom, RIM_CENTER) >= PG_LANE_HALF_WIDTH_M) return target;
  const dx = RIM_CENTER.x - laneFrom.x;
  const dz = RIM_CENTER.z - laneFrom.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return target;
  // Unit normal pointing toward +x (toward +z for a lane along x).
  let nx = -dz / length;
  let nz = dx / length;
  if (nx < 0 || (nx === 0 && nz < 0)) {
    nx = -nx;
    nz = -nz;
  }
  const selfSide = (self.x - laneFrom.x) * nx + (self.z - laneFrom.z) * nz;
  const side = selfSide < 0 ? -1 : 1;
  const offset = (target.x - laneFrom.x) * nx + (target.z - laneFrom.z) * nz;
  const shift = side * clearance - offset;
  return clampToCourt({ x: target.x + nx * shift, z: target.z + nz * shift });
}

/** Sum of push-away vectors from `others` within SEPARATION_RADIUS_M of `self`, weight SEPARATION_GAIN * (R - d) / R. */
export function separationPush(self: CourtPoint, others: readonly CourtPoint[]): CourtPoint {
  let x = 0;
  let z = 0;
  for (const other of others) {
    const dx = self.x - other.x;
    const dz = self.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d >= SEPARATION_RADIUS_M) continue;
    const weight = (SEPARATION_GAIN * (SEPARATION_RADIUS_M - d)) / SEPARATION_RADIUS_M;
    if (d === 0) {
      x += weight;
    } else {
      x += (dx / d) * weight;
      z += (dz / d) * weight;
    }
  }
  return { x, z };
}
