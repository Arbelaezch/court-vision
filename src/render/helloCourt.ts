import * as THREE from 'three';

// Dimensions in meters.
export const HALF_COURT_WIDTH = 15;
export const HALF_COURT_DEPTH = 14;
export const RIM_HEIGHT = 3.05;

const BACKBOARD_HEIGHT = 1.05;
const BACKBOARD_BOTTOM = 2.9;
const RIM_OFFSET_FROM_BACKBOARD = 0.375;

function createHoop(): THREE.Group {
  const hoop = new THREE.Group();
  hoop.name = 'hoop';
  hoop.position.set(0, 0, -HALF_COURT_DEPTH / 2 + 1.2);

  const backboardCenterY = BACKBOARD_BOTTOM + BACKBOARD_HEIGHT / 2;

  const backboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, BACKBOARD_HEIGHT, 0.05),
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
    new THREE.TorusGeometry(0.225, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xff6a00 }),
  );
  rim.name = 'rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, RIM_HEIGHT, RIM_OFFSET_FROM_BACKBOARD);

  hoop.add(pole, backboard, rim);
  return hoop;
}

export function createHelloCourtScene(): {
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

  scene.add(createHoop());

  scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 12, 8);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 11, 13);
  camera.lookAt(0, 0, -2);

  return { scene, camera };
}
