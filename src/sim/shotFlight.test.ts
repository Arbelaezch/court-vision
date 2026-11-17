import { describe, expect, it } from 'vitest';
import { RIM_CENTER } from './court';
import {
  FLOATER_MIN_FLIGHT_TICKS,
  SHOT_MIN_FLIGHT_TICKS,
  SHOT_MISS_OFFSET_M,
  SHOT_SPEED_MPS,
  shotFlightTicks,
  shotTargetPoint,
} from './shotFlight';
import { SIM_HZ } from './stepper';

const out = (m: number) => ({ x: RIM_CENTER.x, z: RIM_CENTER.z + m });

describe('shotFlightTicks', () => {
  it('gives a floater at least the floater minimum at any floater distance', () => {
    expect(shotFlightTicks('floater', out(1), true)).toBe(FLOATER_MIN_FLIGHT_TICKS);
    expect(shotFlightTicks('floater', out(4.5), true)).toBe(FLOATER_MIN_FLIGHT_TICKS);
  });

  it('gives a close layup or jumper the shot minimum', () => {
    expect(shotFlightTicks('layup', out(1), true)).toBe(SHOT_MIN_FLIGHT_TICKS);
    expect(shotFlightTicks('jumper', out(1), true)).toBe(SHOT_MIN_FLIGHT_TICKS);
  });

  it('scales with distance for a long shot', () => {
    expect(shotFlightTicks('jumper', out(7), true)).toBe(Math.ceil((7 / SHOT_SPEED_MPS) * SIM_HZ));
  });
});

describe('shotTargetPoint', () => {
  it('lands a make at the rim centre', () => {
    expect(shotTargetPoint(out(3), true)).toEqual({ x: RIM_CENTER.x, z: RIM_CENTER.z });
  });

  it('lands a miss past the rim, on the far side from the shooter', () => {
    const t = shotTargetPoint(out(3), false);
    expect(t.x).toBeCloseTo(RIM_CENTER.x, 12);
    expect(t.z).toBeCloseTo(RIM_CENTER.z - SHOT_MISS_OFFSET_M, 12);
  });

  it('uses the (0, 1) direction for a shooter exactly at the rim centre', () => {
    const t = shotTargetPoint({ x: RIM_CENTER.x, z: RIM_CENTER.z }, false);
    expect(t.x).toBeCloseTo(RIM_CENTER.x, 12);
    expect(t.z).toBeCloseTo(RIM_CENTER.z + SHOT_MISS_OFFSET_M, 12);
  });
});
