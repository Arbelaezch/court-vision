import * as THREE from 'three';
import type { Vec3 } from '../sim';
import { disposeObject3D } from './dispose';
import { BALL_RADIUS_M } from './simInterpolation';
import { OUTLINE_THICKNESS_M, createOutlineMaterial, createToonMaterial } from './toon';

/** Height of the floor shadow above the court, m (avoids z-fighting with the floor). */
const SHADOW_Y_M = 0.01;

export interface BallLayer {
  readonly object: THREE.Group;
  sync(pos: Vec3 | null): void;
  dispose(): void;
}

// The ball: a toon sphere with an inverted-hull outline and a flat floor shadow so heights read.
export function createBallLayer(): BallLayer {
  const group = new THREE.Group();
  group.name = 'ball';

  const { material: toon, gradient } = createToonMaterial();
  toon.color.set(0xe0702a);
  const outlineMaterial = createOutlineMaterial();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
  });

  const sphere = new THREE.SphereGeometry(BALL_RADIUS_M, 16, 12);
  const mesh = new THREE.Mesh(sphere, toon);
  mesh.name = 'ball-mesh';
  const outline = new THREE.Mesh(sphere, outlineMaterial);
  outline.name = 'ball-outline';
  outline.scale.setScalar((BALL_RADIUS_M + OUTLINE_THICKNESS_M) / BALL_RADIUS_M);
  mesh.add(outline);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_RADIUS_M, 16), shadowMaterial);
  shadow.name = 'ball-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SHADOW_Y_M;

  group.add(mesh, shadow);
  group.visible = false;

  return {
    object: group,
    sync(pos) {
      if (!pos) {
        group.visible = false;
        return;
      }
      group.visible = true;
      mesh.position.set(pos.x, pos.y, pos.z);
      shadow.position.set(pos.x, SHADOW_Y_M, pos.z);
    },
    dispose() {
      disposeObject3D(group);
      gradient.dispose();
    },
  };
}
