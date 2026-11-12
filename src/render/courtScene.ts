import * as THREE from 'three';
import {
  BACKBOARD_BOTTOM_HEIGHT,
  BACKBOARD_FROM_BASELINE,
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  BASELINE_Z,
  HALF_COURT_DEPTH,
  HALF_COURT_WIDTH,
  RIM_CENTER_FROM_BASELINE,
  RIM_HEIGHT,
  RIM_RADIUS,
} from '../sim';
import { createCourtMarkings } from './courtMarkings';
import { createGymBackdrop } from './gym';
import { createTacticalCamera } from './tacticalCamera';

const RIM_OFFSET_FROM_BACKBOARD = RIM_CENTER_FROM_BASELINE - BACKBOARD_FROM_BASELINE;

function createHoop(): THREE.Group {
  const hoop = new THREE.Group();
  hoop.name = 'hoop';
  hoop.position.set(0, 0, BASELINE_Z + BACKBOARD_FROM_BASELINE);

  const backboardCenterY = BACKBOARD_BOTTOM_HEIGHT + BACKBOARD_HEIGHT / 2;

  const backboard = new THREE.Mesh(
    new THREE.BoxGeometry(BACKBOARD_WIDTH, BACKBOARD_HEIGHT, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  backboard.name = 'backboard';
  backboard.position.set(0, backboardCenterY, 0);

  const poleHeight = backboardCenterY;
  const pole = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, poleHeight, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x444444 }),
  );
  pole.name = 'pole';
  pole.position.set(0, poleHeight / 2, -0.2);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_RADIUS, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xff6a00 }),
  );
  rim.name = 'rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, RIM_HEIGHT, RIM_OFFSET_FROM_BACKBOARD);

  hoop.add(pole, backboard, rim);
  return hoop;
}

export function createCourtScene(opts: { topHeight?: number } = {}): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ef);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_COURT_WIDTH, HALF_COURT_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0xc8925a }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  scene.add(createCourtMarkings());
  scene.add(createGymBackdrop());
  scene.add(createHoop());

  scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 12, 8);
  scene.add(sun);

  const camera = createTacticalCamera(16 / 9, opts.topHeight);

  return { scene, camera };
}
