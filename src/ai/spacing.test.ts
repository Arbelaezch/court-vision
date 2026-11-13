import { describe, expect, it } from 'vitest';
import { RIM_CENTER } from '../sim';
import {
  PG_LANE_HALF_WIDTH_M,
  SEPARATION_RADIUS_M,
  clearOfLane,
  distanceToSegment,
  separationPush,
} from './spacing';

describe('distanceToSegment', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 4, z: 0 };

  it('measures the perpendicular distance beside the segment', () => {
    expect(distanceToSegment({ x: 2, z: 3 }, a, b)).toBeCloseTo(3);
  });

  it('measures the distance to the nearest endpoint past the ends', () => {
    expect(distanceToSegment({ x: 7, z: 4 }, a, b)).toBeCloseTo(5);
    expect(distanceToSegment({ x: -3, z: 4 }, a, b)).toBeCloseTo(5);
  });

  it('is zero on the segment and handles a degenerate segment', () => {
    expect(distanceToSegment({ x: 1, z: 0 }, a, b)).toBe(0);
    expect(distanceToSegment({ x: 3, z: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe('clearOfLane', () => {
  const from = { x: 0, z: 5 };

  it('moves a target in the lane out to |x| >= 1.5 (+x on a tie)', () => {
    const out = clearOfLane({ x: 0, z: -2 }, { x: 0, z: -2 }, from);
    expect(Math.abs(out.x)).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(out.x).toBeGreaterThan(0);
    expect(out.z).toBeCloseTo(-2);
    expect(distanceToSegment(out, from, RIM_CENTER)).toBeGreaterThanOrEqual(PG_LANE_HALF_WIDTH_M);
  });

  it('uses the side self is on', () => {
    const out = clearOfLane({ x: 0.2, z: -2 }, { x: -3, z: -2 }, from);
    expect(out.x).toBeLessThanOrEqual(-1.5 + 1e-9);
  });

  it('keeps a target outside the lane unchanged', () => {
    const target = { x: 4, z: 1 };
    expect(clearOfLane(target, { x: 5, z: 0 }, from)).toEqual(target);
  });
});

describe('separationPush', () => {
  it('is zero beyond the separation radius', () => {
    const push = separationPush({ x: 0, z: 0 }, [{ x: SEPARATION_RADIUS_M + 0.01, z: 0 }]);
    expect(push).toEqual({ x: 0, z: 0 });
  });

  it('points away from a close neighbour, stronger when closer', () => {
    const near = separationPush({ x: 0, z: 0 }, [{ x: 0.2, z: 0 }]);
    const far = separationPush({ x: 0, z: 0 }, [{ x: 0.8, z: 0 }]);
    expect(near.x).toBeLessThan(0);
    expect(near.z).toBeCloseTo(0);
    expect(far.x).toBeLessThan(0);
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
  });

  it('sums pushes from several neighbours', () => {
    const push = separationPush({ x: 0, z: 0 }, [
      { x: 0.5, z: 0 },
      { x: -0.5, z: 0 },
    ]);
    expect(push.x).toBeCloseTo(0);
  });
});
