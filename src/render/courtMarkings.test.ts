import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_Z,
  COURT_LINE_WIDTH,
  FREE_THROW_CIRCLE_RADIUS,
  FREE_THROW_LINE_Z,
  HALF_COURT_WIDTH,
  KEY_WIDTH,
  RIM_CENTER,
  THREE_POINT_CORNER_END_Z,
  THREE_POINT_CORNER_X,
  THREE_POINT_RADIUS,
} from '../sim';
import { createCourtMarkings } from './courtMarkings';

const NAMES = [
  'baseline',
  'sideline-left',
  'sideline-right',
  'half-court-line',
  'lane-line-left',
  'lane-line-right',
  'free-throw-line',
  'key-paint',
  'free-throw-circle',
  'three-point-corner-left',
  'three-point-corner-right',
  'three-point-arc',
  'center-circle',
];

function build(): THREE.Group {
  const group = createCourtMarkings();
  group.updateMatrixWorld(true);
  return group;
}

function worldVertices(mesh: THREE.Object3D): THREE.Vector3[] {
  const position = (mesh as THREE.Mesh).geometry.attributes.position!;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    out.push(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i)));
  }
  return out;
}

function box(group: THREE.Group, name: string): THREE.Box3 {
  return new THREE.Box3().setFromObject(group.getObjectByName(name)!);
}

describe('createCourtMarkings', () => {
  it('has every named marking as a mesh', () => {
    const group = build();
    expect(group.name).toBe('court-markings');
    for (const name of NAMES) {
      expect(group.getObjectByName(name), name).toBeInstanceOf(THREE.Mesh);
    }
  });

  it('draws the three-point arc on the correct radius and between the corners', () => {
    const group = build();
    const vertices = worldVertices(group.getObjectByName('three-point-arc')!);
    const half = COURT_LINE_WIDTH / 2;
    let maxZ = -Infinity;
    for (const v of vertices) {
      const d = Math.hypot(v.x - RIM_CENTER.x, v.z - RIM_CENTER.z);
      expect(d).toBeGreaterThanOrEqual(THREE_POINT_RADIUS - half - 1e-6);
      expect(d).toBeLessThanOrEqual(THREE_POINT_RADIUS + half + 1e-6);
      expect(v.z).toBeGreaterThanOrEqual(THREE_POINT_CORNER_END_Z - COURT_LINE_WIDTH);
      maxZ = Math.max(maxZ, v.z);
    }
    expect(Math.abs(maxZ - (RIM_CENTER.z + THREE_POINT_RADIUS))).toBeLessThanOrEqual(
      COURT_LINE_WIDTH,
    );
    for (const sign of [-1, 1]) {
      const near = vertices.some(
        (v) =>
          Math.hypot(v.x - sign * THREE_POINT_CORNER_X, v.z - THREE_POINT_CORNER_END_Z) <=
          COURT_LINE_WIDTH,
      );
      expect(near).toBe(true);
    }
  });

  it('draws the free-throw circle on its radius', () => {
    const group = build();
    for (const v of worldVertices(group.getObjectByName('free-throw-circle')!)) {
      const d = Math.hypot(v.x, v.z - FREE_THROW_LINE_Z);
      expect(Math.abs(d - FREE_THROW_CIRCLE_RADIUS)).toBeLessThanOrEqual(COURT_LINE_WIDTH / 2 + 1e-6);
    }
  });

  it('places straight lines correctly', () => {
    const group = build();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    const baseline = box(group, 'baseline');
    expect(baseline.getCenter(center).z).toBeCloseTo(BASELINE_Z, 5);
    expect(baseline.getSize(size).x).toBeCloseTo(HALF_COURT_WIDTH, 5);

    const lane = box(group, 'lane-line-left');
    expect(lane.getCenter(center).x).toBeCloseTo(-KEY_WIDTH / 2, 5);
    expect(lane.min.z).toBeCloseTo(BASELINE_Z, 5);
    expect(lane.max.z).toBeCloseTo(FREE_THROW_LINE_Z, 5);

    const corner = box(group, 'three-point-corner-right');
    expect(corner.getCenter(center).x).toBeCloseTo(THREE_POINT_CORNER_X, 5);
    expect(corner.max.z).toBeCloseTo(THREE_POINT_CORNER_END_Z, 5);
  });

  it('keeps every marking flat and just above the floor', () => {
    const group = build();
    for (const name of NAMES) {
      const b = box(group, name);
      expect(b.min.y, name).toBeGreaterThan(0);
      expect(b.max.y, name).toBeLessThan(0.05);
    }
  });
});
