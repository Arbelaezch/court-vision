import * as THREE from 'three';
import type { Cue } from '../content';
import type { CourtPoint, RoleId } from '../sim';
import { disposeObject3D } from './dispose';

// Court lines sit at 0.01 (courtMarkings LINE_Y); cues float just above them.
export const CUE_FLOOR_Y_M = 0.02;
export const CUE_ARROW_WIDTH_M = 0.25;
export const CUE_ARROW_HEAD_M = 0.6;
export const CUE_ARROW_START_GAP_M = 0.5;
export const CUE_ARROW_MIN_LENGTH_M = 0.3;
export const CUE_RING_INNER_M = 0.55;
export const CUE_RING_OUTER_M = 0.7;
export const CUE_RING_PULSE_PERIOD_S = 1;
export const CUE_RING_PULSE_AMPLITUDE = 0.15;
export const CUE_SPOT_RADIUS_M = 0.4;

const CUE_COLOR = '#ffd23f';

export interface CueLayerInput {
  readonly cues: readonly Cue[];
  readonly offense: Readonly<Partial<Record<RoleId, CourtPoint>>>;
  readonly humanRole: RoleId;
  readonly dtSec: number;
}

export interface CueLayer {
  readonly object: THREE.Group;
  sync(input: CueLayerInput): void;
  dispose(): void;
}

// Draws the world-space cues (floor arrow, target ring, spot marker). The HTML overlay draws prompts.
export function createCueLayer(): CueLayer {
  const group = new THREE.Group();
  group.name = 'cues';

  const material = new THREE.MeshBasicMaterial({
    color: CUE_COLOR,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  // Arrow geometry points along local +x. Shaft spans x 0..1 (scaled to length); head tip is the origin.
  const shaftGeometry = new THREE.PlaneGeometry(1, CUE_ARROW_WIDTH_M);
  shaftGeometry.rotateX(-Math.PI / 2);
  shaftGeometry.translate(0.5, 0, 0);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0,
        0,
        0,
        -CUE_ARROW_HEAD_M,
        0,
        -CUE_ARROW_HEAD_M / 2,
        -CUE_ARROW_HEAD_M,
        0,
        CUE_ARROW_HEAD_M / 2,
      ],
      3,
    ),
  );
  const ringGeometry = new THREE.RingGeometry(CUE_RING_INNER_M, CUE_RING_OUTER_M, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  // Four segments make a diamond.
  const spotGeometry = new THREE.CircleGeometry(CUE_SPOT_RADIUS_M, 4);
  spotGeometry.rotateX(-Math.PI / 2);

  const arrows: THREE.Group[] = [];
  const rings: THREE.Mesh[] = [];
  const spots: THREE.Mesh[] = [];

  function makeArrow(): THREE.Group {
    const arrow = new THREE.Group();
    arrow.name = `cue-floor-arrow-${arrows.length}`;
    const shaft = new THREE.Mesh(shaftGeometry, material);
    shaft.name = 'cue-floor-arrow-shaft';
    const head = new THREE.Mesh(headGeometry, material);
    head.name = 'cue-floor-arrow-head';
    shaft.renderOrder = 1;
    head.renderOrder = 1;
    arrow.add(shaft, head);
    arrow.visible = false;
    arrows.push(arrow);
    group.add(arrow);
    return arrow;
  }
  function makeMesh(
    pool: THREE.Mesh[],
    prefix: string,
    geometry: THREE.BufferGeometry,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${prefix}-${pool.length}`;
    mesh.renderOrder = 1;
    mesh.visible = false;
    pool.push(mesh);
    group.add(mesh);
    return mesh;
  }
  const makeRing = () => makeMesh(rings, 'cue-target-ring', ringGeometry);
  const makeSpot = () => makeMesh(spots, 'cue-spot-marker', spotGeometry);

  // One hidden instance of each kind so the shared geometry and material are in the tree.
  makeArrow();
  makeRing();
  makeSpot();

  let elapsedS = 0;

  function placeArrow(arrow: THREE.Group, from: CourtPoint, to: CourtPoint): boolean {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const fullLen = Math.hypot(dx, dz);
    if (fullLen === 0) return false;
    const ux = dx / fullLen;
    const uz = dz / fullLen;
    const startX = from.x + ux * CUE_ARROW_START_GAP_M;
    const startZ = from.z + uz * CUE_ARROW_START_GAP_M;
    const len = Math.hypot(to.x - startX, to.z - startZ);
    if (len < CUE_ARROW_MIN_LENGTH_M || fullLen <= CUE_ARROW_START_GAP_M) return false;
    arrow.position.set(startX, CUE_FLOOR_Y_M, startZ);
    arrow.rotation.set(0, Math.atan2(-uz, ux), 0);
    const shaft = arrow.children[0] as THREE.Mesh;
    const head = arrow.children[1] as THREE.Mesh;
    const shaftLen = len - CUE_ARROW_HEAD_M;
    shaft.visible = shaftLen > 0;
    shaft.scale.set(Math.max(shaftLen, 1e-4), 1, 1);
    head.position.set(len, 0, 0);
    arrow.visible = true;
    return true;
  }

  return {
    object: group,
    sync(input) {
      for (const child of group.children) child.visible = false;
      elapsedS += Math.max(0, input.dtSec);
      let arrowCount = 0;
      let ringCount = 0;
      let spotCount = 0;
      for (const cue of input.cues) {
        switch (cue.kind) {
          case 'floorArrow': {
            const from = input.offense[input.humanRole];
            if (!from) break;
            const arrow = arrows[arrowCount] ?? makeArrow();
            arrowCount += 1;
            placeArrow(arrow, from, cue.to);
            break;
          }
          case 'targetRing': {
            const at = input.offense[cue.role];
            if (!at) break;
            const ring = rings[ringCount] ?? makeRing();
            ringCount += 1;
            const pulse =
              1 +
              CUE_RING_PULSE_AMPLITUDE *
                Math.sin((2 * Math.PI * elapsedS) / CUE_RING_PULSE_PERIOD_S);
            ring.position.set(at.x, CUE_FLOOR_Y_M, at.z);
            ring.scale.set(pulse, 1, pulse);
            ring.visible = true;
            break;
          }
          case 'spotMarker': {
            const spot = spots[spotCount] ?? makeSpot();
            spotCount += 1;
            spot.position.set(cue.spot.x, CUE_FLOOR_Y_M, cue.spot.z);
            spot.visible = true;
            break;
          }
          case 'prompt':
            break;
        }
      }
    },
    dispose() {
      disposeObject3D(group);
    },
  };
}
