// Court geometry shared by sim and render. Headless: no three.js, no DOM.
// All lengths in meters; FIBA dimensions measured to line centrelines; coordinates: origin at
// court centre, -z toward the basket, y up.

import type { CourtPoint } from './state';

export const HALF_COURT_WIDTH = 15;
export const HALF_COURT_DEPTH = 14;
export const RIM_HEIGHT = 3.05;

export const SIDELINE_X = HALF_COURT_WIDTH / 2;
export const BASELINE_Z = -HALF_COURT_DEPTH / 2;
export const HALF_COURT_LINE_Z = HALF_COURT_DEPTH / 2;
// Bolder than FIBA's 0.05, for readability under cues.
export const COURT_LINE_WIDTH = 0.08;

export const BACKBOARD_FROM_BASELINE = 1.2;
export const BACKBOARD_WIDTH = 1.8;
export const BACKBOARD_HEIGHT = 1.05;
export const BACKBOARD_BOTTOM_HEIGHT = 2.9;
export const RIM_RADIUS = 0.225;
export const RIM_CENTER_FROM_BASELINE = 1.575;
export const RIM_CENTER: Readonly<CourtPoint> = Object.freeze({
  x: 0,
  z: BASELINE_Z + RIM_CENTER_FROM_BASELINE,
});

export const KEY_WIDTH = 4.9;
export const FREE_THROW_LINE_FROM_BASELINE = 5.8;
export const FREE_THROW_LINE_Z = BASELINE_Z + FREE_THROW_LINE_FROM_BASELINE;
export const FREE_THROW_CIRCLE_RADIUS = 1.8;

export const THREE_POINT_RADIUS = 6.75;
export const THREE_POINT_CORNER_FROM_SIDELINE = 0.9;
export const THREE_POINT_CORNER_X = SIDELINE_X - THREE_POINT_CORNER_FROM_SIDELINE;
// Where the corner straights meet the arc.
export const THREE_POINT_CORNER_END_Z =
  RIM_CENTER.z + Math.sqrt(THREE_POINT_RADIUS ** 2 - THREE_POINT_CORNER_X ** 2);

export const CENTER_CIRCLE_RADIUS = 1.8;

/** True when the point is on or inside the half-court lines. */
export function isInBounds(p: CourtPoint): boolean {
  return Math.abs(p.x) <= SIDELINE_X && p.z >= BASELINE_Z && p.z <= HALF_COURT_LINE_Z;
}

/** True when the point is on or beyond the three-point line (corner straights, then the arc). */
export function isBeyondArc(p: CourtPoint): boolean {
  if (p.z <= THREE_POINT_CORNER_END_Z) {
    return Math.abs(p.x) >= THREE_POINT_CORNER_X;
  }
  return Math.hypot(p.x - RIM_CENTER.x, p.z - RIM_CENTER.z) >= THREE_POINT_RADIUS;
}
