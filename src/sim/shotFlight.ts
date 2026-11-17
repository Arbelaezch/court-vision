// How long a shot is in the air and where it lands. Pure sim data, shared by the renderer, the sound
// director and the run controller so they all agree on one flight length.
import { RIM_CENTER } from './court';
import { SIM_HZ } from './stepper';
import type { CourtPoint, ShotType } from './state';

/** Horizontal speed of a shot in flight, m/s. */
export const SHOT_SPEED_MPS = 8;
/** Shortest shot flight, sim ticks. */
export const SHOT_MIN_FLIGHT_TICKS = 12;
/** A floater's shortest flight, sim ticks (0.6 s), so it reads as a soft, high shot. */
export const FLOATER_MIN_FLIGHT_TICKS = 36;
/** How far past the rim centre a missed shot lands, m. */
export const SHOT_MISS_OFFSET_M = 0.35;

/** Where a shot from `from` lands on the court plane: the rim centre for a make, just past it for a miss. */
export function shotTargetPoint(from: CourtPoint, made: boolean): CourtPoint {
  if (made) return { x: RIM_CENTER.x, z: RIM_CENTER.z };
  const dx = RIM_CENTER.x - from.x;
  const dz = RIM_CENTER.z - from.z;
  const len = Math.hypot(dx, dz);
  const ux = len > 1e-9 ? dx / len : 0;
  const uz = len > 1e-9 ? dz / len : 1;
  return {
    x: RIM_CENTER.x + ux * SHOT_MISS_OFFSET_M,
    z: RIM_CENTER.z + uz * SHOT_MISS_OFFSET_M,
  };
}

/** Sim ticks a shot from `from` stays in the air before it reaches the rim height at its target. */
export function shotFlightTicks(shotType: ShotType, from: CourtPoint, made: boolean): number {
  const target = shotTargetPoint(from, made);
  const dist = Math.hypot(target.x - from.x, target.z - from.z);
  return Math.max(
    shotType === 'floater' ? FLOATER_MIN_FLIGHT_TICKS : SHOT_MIN_FLIGHT_TICKS,
    Math.ceil((dist / SHOT_SPEED_MPS) * SIM_HZ),
  );
}
