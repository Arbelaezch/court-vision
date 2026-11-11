import * as THREE from 'three';
import {
  BACKBOARD_BOTTOM_HEIGHT,
  BACKBOARD_FROM_BASELINE,
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  BASELINE_Z,
  HALF_COURT_LINE_Z,
  SIDELINE_X,
} from '../sim';

export const TACTICAL_FOV_DEG = 45;
/** Camera elevation above horizontal, looking toward -z. */
export const TACTICAL_PITCH_DEG = 40;
export const TACTICAL_TARGET: Readonly<{ x: number; y: number; z: number }> = Object.freeze({
  x: 0,
  y: 0,
  z: -1,
});
export const FIT_NDC_LIMIT = 0.92;
export const PLAYER_HEAD_HEIGHT = 2.2;
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 300;
export const MIN_CAMERA_DISTANCE = 5;
export const MAX_CAMERA_DISTANCE = 200;

const BISECTION_ITERATIONS = 40;

/** Points that must stay inside the view: court corners, head-height points above them, backboard top. */
export function tacticalFitPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const y of [0, PLAYER_HEAD_HEIGHT]) {
    for (const x of [-SIDELINE_X, SIDELINE_X]) {
      for (const z of [BASELINE_Z, HALF_COURT_LINE_Z]) {
        points.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  const backboardTop = BACKBOARD_BOTTOM_HEIGHT + BACKBOARD_HEIGHT;
  for (const x of [-BACKBOARD_WIDTH / 2, BACKBOARD_WIDTH / 2]) {
    points.push(new THREE.Vector3(x, backboardTop, BASELINE_Z + BACKBOARD_FROM_BASELINE));
  }
  return points;
}

function placeCamera(camera: THREE.PerspectiveCamera, distance: number): void {
  const pitch = THREE.MathUtils.degToRad(TACTICAL_PITCH_DEG);
  camera.position.set(
    TACTICAL_TARGET.x,
    TACTICAL_TARGET.y + Math.sin(pitch) * distance,
    TACTICAL_TARGET.z + Math.cos(pitch) * distance,
  );
  camera.lookAt(TACTICAL_TARGET.x, TACTICAL_TARGET.y, TACTICAL_TARGET.z);
  camera.updateMatrixWorld(true);
}

function fits(camera: THREE.PerspectiveCamera, points: THREE.Vector3[]): boolean {
  const view = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  return points.every((point) => {
    view.copy(point).applyMatrix4(camera.matrixWorldInverse);
    if (!(view.z < -camera.near)) return false;
    ndc.copy(point).project(camera);
    return Math.abs(ndc.x) <= FIT_NDC_LIMIT && Math.abs(ndc.y) <= FIT_NDC_LIMIT;
  });
}

/**
 * Keeps FOV and pitch fixed and dollies along the view axis to the closest
 * distance at which the whole half court fits. Smoothing and pan limits arrive with a follow target.
 */
export function fitTacticalCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  if (!(Number.isFinite(aspect) && aspect > 0)) {
    throw new Error('Court Vision: camera aspect must be a positive finite number');
  }
  camera.fov = TACTICAL_FOV_DEG;
  camera.aspect = aspect;
  camera.near = CAMERA_NEAR;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const points = tacticalFitPoints();
  let low = MIN_CAMERA_DISTANCE;
  let high = MAX_CAMERA_DISTANCE;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    placeCamera(camera, mid);
    if (fits(camera, points)) high = mid;
    else low = mid;
  }
  placeCamera(camera, high);
}

export function createTacticalCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  fitTacticalCamera(camera, aspect);
  return camera;
}
