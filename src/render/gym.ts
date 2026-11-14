import * as THREE from 'three';
import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X } from '../sim';

const WALL_HEIGHT = 10;
const WALL_BACK_WIDTH = 40;
const WALL_X = SIDELINE_X + 6;
const WALL_BACK_Z = BASELINE_Z - 5;
// Ground and side walls run toward the camera past its maximum dolly distance.
const FRONT_EXTENT = 60;
const GROUND_FRONT_Z = HALF_COURT_LINE_Z + FRONT_EXTENT;
const GROUND_DEPTH = GROUND_FRONT_Z - WALL_BACK_Z;
const GROUND_CENTER_Z = (GROUND_FRONT_Z + WALL_BACK_Z) / 2;

export function createGymBackdrop(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gym';

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_X * 2, GROUND_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a }),
  );
  apron.name = 'apron';
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.02, GROUND_CENTER_Z);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8a9bb0 });

  const wallBack = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_BACK_WIDTH, WALL_HEIGHT),
    wallMaterial,
  );
  wallBack.name = 'wall-back';
  wallBack.position.set(0, WALL_HEIGHT / 2, WALL_BACK_Z);

  const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_DEPTH, WALL_HEIGHT), wallMaterial);
  wallLeft.name = 'wall-left';
  wallLeft.rotation.y = Math.PI / 2; // faces +x (inward)
  wallLeft.position.set(-WALL_X, WALL_HEIGHT / 2, GROUND_CENTER_Z);

  const wallRight = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_DEPTH, WALL_HEIGHT),
    wallMaterial,
  );
  wallRight.name = 'wall-right';
  wallRight.rotation.y = -Math.PI / 2; // faces -x (inward)
  wallRight.position.set(WALL_X, WALL_HEIGHT / 2, GROUND_CENTER_Z);

  group.add(apron, wallBack, wallLeft, wallRight);
  return group;
}
