import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createHelloCourtScene,
  HALF_COURT_DEPTH,
  HALF_COURT_WIDTH,
  RIM_HEIGHT,
} from './helloCourt';

describe('createHelloCourtScene', () => {
  it('has a horizontal plane floor', () => {
    const { scene } = createHelloCourtScene();
    const floor = scene.getObjectByName('floor');
    expect(floor).toBeInstanceOf(THREE.Mesh);
    expect((floor as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(floor?.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('has a hoop with backboard, rim and pole', () => {
    const { scene } = createHelloCourtScene();
    const hoop = scene.getObjectByName('hoop');
    expect(hoop).toBeDefined();
    for (const name of ['backboard', 'rim', 'pole']) {
      expect(hoop?.getObjectByName(name)).toBeDefined();
    }
  });

  it('places the rim at regulation height inside the half court', () => {
    const { scene } = createHelloCourtScene();
    scene.updateMatrixWorld(true);
    const rim = scene.getObjectByName('rim');
    const pos = rim!.getWorldPosition(new THREE.Vector3());
    expect(pos.y).toBeCloseTo(RIM_HEIGHT, 2);
    expect(Math.abs(pos.x)).toBeLessThanOrEqual(HALF_COURT_WIDTH / 2);
    expect(Math.abs(pos.z)).toBeLessThanOrEqual(HALF_COURT_DEPTH / 2);
  });

  it('uses an elevated camera looking down', () => {
    const { camera } = createHelloCourtScene();
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(0);
  });
});
