import { describe, expect, it } from 'vitest';
import {
  BASELINE_Z,
  FREE_THROW_LINE_Z,
  HALF_COURT_LINE_Z,
  KEY_WIDTH,
  RIM_CENTER,
  SIDELINE_X,
  THREE_POINT_CORNER_END_Z,
  THREE_POINT_CORNER_X,
  THREE_POINT_RADIUS,
  isBeyondArc,
  isInBounds,
} from './court';

describe('court constants', () => {
  it('places the rim centre 1.575 m from the baseline on the centreline', () => {
    expect(RIM_CENTER.x).toBe(0);
    expect(RIM_CENTER.z).toBeCloseTo(-5.425, 6);
  });

  it('places the free-throw line', () => {
    expect(FREE_THROW_LINE_Z).toBeCloseTo(-1.2, 6);
  });

  it('meets the corner straights and the arc at the three-point radius', () => {
    const dist = Math.hypot(
      THREE_POINT_CORNER_X - RIM_CENTER.x,
      THREE_POINT_CORNER_END_Z - RIM_CENTER.z,
    );
    expect(dist).toBeCloseTo(THREE_POINT_RADIUS, 6);
    expect(THREE_POINT_CORNER_END_Z - BASELINE_Z).toBeCloseTo(2.99, 1);
  });

  it('keeps key, arc apex and corner lines inside the half court', () => {
    const xs = [-KEY_WIDTH / 2, KEY_WIDTH / 2, -THREE_POINT_CORNER_X, THREE_POINT_CORNER_X];
    for (const x of xs) {
      expect(Math.abs(x)).toBeLessThanOrEqual(SIDELINE_X);
    }
    const zs = [RIM_CENTER.z + THREE_POINT_RADIUS, THREE_POINT_CORNER_END_Z, FREE_THROW_LINE_Z];
    for (const z of zs) {
      expect(z).toBeGreaterThanOrEqual(BASELINE_Z);
      expect(z).toBeLessThanOrEqual(HALF_COURT_LINE_Z);
    }
  });

  it('freezes the rim centre', () => {
    expect(Object.isFrozen(RIM_CENTER)).toBe(true);
  });
});

describe('isInBounds', () => {
  it('is true at the origin and on each line', () => {
    expect(isInBounds({ x: 0, z: 0 })).toBe(true);
    expect(isInBounds({ x: SIDELINE_X, z: 0 })).toBe(true);
    expect(isInBounds({ x: -SIDELINE_X, z: 0 })).toBe(true);
    expect(isInBounds({ x: 0, z: BASELINE_Z })).toBe(true);
    expect(isInBounds({ x: 0, z: HALF_COURT_LINE_Z })).toBe(true);
  });

  it('is false just past the sideline, baseline and half-court line', () => {
    expect(isInBounds({ x: SIDELINE_X + 0.01, z: 0 })).toBe(false);
    expect(isInBounds({ x: -SIDELINE_X - 0.01, z: 0 })).toBe(false);
    expect(isInBounds({ x: 0, z: BASELINE_Z - 0.01 })).toBe(false);
    expect(isInBounds({ x: 0, z: HALF_COURT_LINE_Z + 0.01 })).toBe(false);
  });
});

describe('isBeyondArc', () => {
  it('is false at the rim and inside the arc', () => {
    expect(isBeyondArc(RIM_CENTER)).toBe(false);
    expect(isBeyondArc({ x: 0, z: -1 })).toBe(false);
  });

  it('is true beyond the arc at the top', () => {
    expect(isBeyondArc({ x: 0, z: 1.5 })).toBe(true);
  });

  it('uses the corner straight below the arc join', () => {
    expect(isBeyondArc({ x: 7.0, z: -6 })).toBe(true);
    expect(isBeyondArc({ x: 6.5, z: -6 })).toBe(false);
  });
});
