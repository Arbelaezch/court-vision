import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIM_CENTER, RIM_HEIGHT, THREE_POINT_RADIUS } from '../sim';
import {
  FIT_NDC_LIMIT,
  PLAYER_HEAD_HEIGHT,
  TACTICAL_FOV_DEG,
  TACTICAL_PITCH_DEG,
  createTacticalCamera,
  fitTacticalCamera,
  tacticalFitPoints,
} from './tacticalCamera';

const ASPECTS = [21 / 9, 16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 0.4];

describe('fitTacticalCamera', () => {
  it.each(ASPECTS)('fits the half court at aspect %f', (aspect) => {
    const camera = new THREE.PerspectiveCamera();
    fitTacticalCamera(camera, aspect);
    expect(camera.aspect).toBe(aspect);
    expect(camera.fov).toBe(TACTICAL_FOV_DEG);

    const view = new THREE.Vector3();
    let maxNdc = 0;
    for (const point of tacticalFitPoints()) {
      view.copy(point).applyMatrix4(camera.matrixWorldInverse);
      expect(view.z).toBeLessThan(-camera.near);
      const ndc = point.clone().project(camera);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(FIT_NDC_LIMIT + 1e-3);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(FIT_NDC_LIMIT + 1e-3);
      maxNdc = Math.max(maxNdc, Math.abs(ndc.x), Math.abs(ndc.y));
    }
    expect(maxNdc).toBeGreaterThanOrEqual(FIT_NDC_LIMIT - 0.02);

    for (const point of [
      new THREE.Vector3(RIM_CENTER.x, RIM_HEIGHT, RIM_CENTER.z),
      new THREE.Vector3(0, 0, RIM_CENTER.z + THREE_POINT_RADIUS),
    ]) {
      const ndc = point.project(camera);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
    }

    const dir = camera.getWorldDirection(new THREE.Vector3());
    expect(dir.x).toBeCloseTo(0, 3);
    expect(Math.asin(-dir.y)).toBeCloseTo(THREE.MathUtils.degToRad(TACTICAL_PITCH_DEG), 3);
    expect(camera.position.y).toBeGreaterThan(0);
  });

  it('rejects invalid aspects', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() => fitTacticalCamera(camera, 0)).toThrow();
    expect(() => fitTacticalCamera(camera, NaN)).toThrow();
  });

  it('createTacticalCamera returns a fitted camera', () => {
    expect(createTacticalCamera(16 / 9).aspect).toBe(16 / 9);
  });

  it('keeps the default top height at head height', () => {
    const maxY = Math.max(...tacticalFitPoints().slice(0, 8).map((p) => p.y));
    expect(maxY).toBe(PLAYER_HEAD_HEIGHT);
  });

  it.each([16 / 9, 1, 9 / 16])('fits a taller top height at aspect %f', (aspect) => {
    const camera = new THREE.PerspectiveCamera();
    fitTacticalCamera(camera, aspect, 2.9);
    for (const point of tacticalFitPoints(2.9)) {
      const ndc = point.clone().project(camera);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(FIT_NDC_LIMIT + 1e-3);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(FIT_NDC_LIMIT + 1e-3);
    }
  });

  it('rejects invalid top heights', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() => fitTacticalCamera(camera, 1, -1)).toThrow();
    expect(() => fitTacticalCamera(camera, 1, NaN)).toThrow();
    expect(() => tacticalFitPoints(-0.1)).toThrow();
  });
});
