import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BASELINE_Z, HALF_COURT_DEPTH, HALF_COURT_WIDTH, RIM_HEIGHT } from '../sim';
import { createCourtScene } from './courtScene';
import { TACTICAL_FOV_DEG } from './tacticalCamera';

describe('createCourtScene', () => {
  it('has a horizontal plane floor', () => {
    const { scene } = createCourtScene();
    const floor = scene.getObjectByName('floor');
    expect(floor).toBeInstanceOf(THREE.Mesh);
    expect((floor as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(floor?.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('has a hoop with backboard, rim and pole', () => {
    const { scene } = createCourtScene();
    const hoop = scene.getObjectByName('hoop');
    expect(hoop).toBeDefined();
    for (const name of ['backboard', 'rim', 'pole']) {
      expect(hoop?.getObjectByName(name)).toBeDefined();
    }
  });

  it('places the rim at regulation height inside the half court', () => {
    const { scene } = createCourtScene();
    scene.updateMatrixWorld(true);
    const rim = scene.getObjectByName('rim');
    const pos = rim!.getWorldPosition(new THREE.Vector3());
    expect(pos.y).toBeCloseTo(RIM_HEIGHT, 2);
    expect(Math.abs(pos.x)).toBeLessThanOrEqual(HALF_COURT_WIDTH / 2);
    expect(Math.abs(pos.z)).toBeLessThanOrEqual(HALF_COURT_DEPTH / 2);
  });

  it('uses an elevated camera looking down', () => {
    const { camera } = createCourtScene();
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(0);
  });

  it('uses the tactical field of view', () => {
    const { camera } = createCourtScene();
    expect(camera.fov).toBe(TACTICAL_FOV_DEG);
  });

  it('contains court markings and the gym backdrop', () => {
    const { scene } = createCourtScene();
    expect(scene.getObjectByName('court-markings')).toBeDefined();
    expect(scene.getObjectByName('gym')).toBeDefined();
  });

  it('stays within the draw-call budget', () => {
    const { scene } = createCourtScene();
    let meshes = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBeLessThanOrEqual(40);
  });

  it('puts the back wall behind the baseline', () => {
    const { scene } = createCourtScene();
    scene.updateMatrixWorld(true);
    const wall = scene.getObjectByName('wall-back')!;
    expect(new THREE.Box3().setFromObject(wall).max.z).toBeLessThan(BASELINE_Z);
  });

  it('extends the apron to the walls and well toward the camera', () => {
    const { scene } = createCourtScene();
    scene.updateMatrixWorld(true);
    const apron = new THREE.Box3().setFromObject(scene.getObjectByName('apron')!);
    const back = new THREE.Box3().setFromObject(scene.getObjectByName('wall-back')!);
    const left = new THREE.Box3().setFromObject(scene.getObjectByName('wall-left')!);
    const right = new THREE.Box3().setFromObject(scene.getObjectByName('wall-right')!);
    expect(apron.min.z).toBeLessThanOrEqual(back.min.z);
    expect(apron.min.x).toBeLessThanOrEqual(left.min.x + 1e-6);
    expect(apron.max.x).toBeGreaterThanOrEqual(right.max.x - 1e-6);
    expect(apron.max.z).toBeGreaterThanOrEqual(50);
  });
});
