import * as THREE from 'three';
import type { TeamCast } from '../content';
import type { RoleId } from '../sim';
import { disposeObject3D } from './dispose';
import type { LabelAtlas } from './labelAtlas';
import { TACTICAL_PITCH_DEG } from './tacticalCamera';
import { createOutlineMaterial, createToonMaterial, outlineScale } from './toon';

export interface ConeSpot {
  role: RoleId;
  x: number;
  z: number;
}

const CONE_RADIUS_M = 0.22;
const CONE_HEIGHT_M = 0.6;
const LABEL_SIZE_M = 0.4;
const LABEL_GAP_M = 0.3;

// Practice-mode defenders: a toon cone in the defense primary with the role id floating above it.
export function createPracticeCones(opts: {
  teams: TeamCast;
  cones: readonly ConeSpot[];
  labels: LabelAtlas;
}): { object: THREE.Group; sync(cones: readonly ConeSpot[]): void; dispose(): void } {
  const { teams, cones, labels } = opts;
  const seen = new Set<RoleId>();
  for (const cone of cones) {
    if (seen.has(cone.role)) throw new Error(`Court Vision: duplicate cone role ${cone.role}`);
    seen.add(cone.role);
  }

  const group = new THREE.Group();
  group.name = 'practice-cones';

  const { material: toon, gradient } = createToonMaterial();
  const outlineMaterial = createOutlineMaterial();

  // Tip up, base on the floor.
  const geometry = new THREE.ConeGeometry(CONE_RADIUS_M, CONE_HEIGHT_M, 16);
  geometry.translate(0, CONE_HEIGHT_M / 2, 0);

  const bodies = new THREE.InstancedMesh(geometry, toon, cones.length);
  bodies.name = 'cone-bodies';
  const outlines = new THREE.InstancedMesh(geometry, outlineMaterial, cones.length);
  outlines.name = 'cone-outlines';
  bodies.frustumCulled = false;
  outlines.frustumCulled = false;
  group.add(bodies, outlines);

  const labelMaterial = new THREE.MeshBasicMaterial({
    map: labels.texture,
    transparent: true,
    alphaTest: 0.4,
    color: teams.defense.colors.secondary,
  });
  const pitch = THREE.MathUtils.degToRad(TACTICAL_PITCH_DEG);
  const primary = new THREE.Color(teams.defense.colors.primary);
  // Full extents (diameter, height) so the hull grows by the thickness on every side.
  const size = new THREE.Vector3(2 * CONE_RADIUS_M, CONE_HEIGHT_M, 2 * CONE_RADIUS_M);
  const grow = outlineScale(size, new THREE.Vector3());
  const matrix = new THREE.Matrix4();
  const hull = new THREE.Matrix4();
  const lift = new THREE.Matrix4().makeTranslation(0, CONE_HEIGHT_M / 2, 0);
  const drop = new THREE.Matrix4().makeTranslation(0, -CONE_HEIGHT_M / 2, 0);

  const place = (cone: ConeSpot, index: number): void => {
    matrix.makeTranslation(cone.x, 0, cone.z);
    bodies.setMatrixAt(index, matrix);
    // Outline hull: grown about mid-height so the base cap dips below the floor (no z-fight).
    hull.copy(matrix).multiply(lift).scale(grow).multiply(drop);
    outlines.setMatrixAt(index, hull);
  };
  const labelMeshes = new Map<RoleId, THREE.Mesh>();
  const indexByRole = new Map(cones.map((c, i) => [c.role, i]));

  cones.forEach((cone, index) => {
    bodies.setColorAt(index, primary);
    place(cone, index);

    const cell = labels.cell(cone.role);
    const plane = new THREE.PlaneGeometry(LABEL_SIZE_M, LABEL_SIZE_M);
    plane.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [cell.u0, cell.v1, cell.u1, cell.v1, cell.u0, cell.v0, cell.u1, cell.v0],
        2,
      ),
    );
    const label = new THREE.Mesh(plane, labelMaterial);
    label.name = `cone-label-${cone.role}`;
    label.position.set(cone.x, CONE_HEIGHT_M + LABEL_GAP_M, cone.z);
    // Tilt toward the tactical camera.
    label.rotation.x = -pitch;
    group.add(label);
    labelMeshes.set(cone.role, label);
  });
  bodies.instanceMatrix.needsUpdate = true;
  outlines.instanceMatrix.needsUpdate = true;

  return {
    object: group,
    sync(next) {
      for (const cone of next) {
        if (!indexByRole.has(cone.role)) {
          throw new Error(`Court Vision: unknown cone role ${cone.role}`);
        }
      }
      if (new Set(next.map((c) => c.role)).size !== cones.length) {
        throw new Error('Court Vision: cone sync needs every cone role exactly once');
      }
      for (const cone of next) {
        place(cone, indexByRole.get(cone.role)!);
        labelMeshes.get(cone.role)!.position.set(cone.x, CONE_HEIGHT_M + LABEL_GAP_M, cone.z);
      }
      bodies.instanceMatrix.needsUpdate = true;
      outlines.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disposeObject3D(group);
      gradient.dispose();
    },
  };
}
