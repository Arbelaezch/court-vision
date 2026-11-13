import * as THREE from 'three';
import type { CastContent } from '../content';
import { PASS_TARGET_BADGE_LABELS, PASS_TARGET_KEYS, passTargetBadgeLabel } from '../sim';
import type { PassTargetBadge } from '../sim';
import type { CharacterPose } from './characters';
import { disposeObject3D } from './dispose';
import { createLabelAtlas } from './labelAtlas';
import type { LabelAtlas } from './labelAtlas';
import { TACTICAL_PITCH_DEG } from './tacticalCamera';

export const BADGE_CELL_WIDTH_PX = 320;
export const BADGE_WIDTH_M = 0.8;
export const BADGE_HEIGHT_M = 0.32;
// Gap above the body top; badge top = heightM + 0.52, below the controlled marker top.
export const BADGE_GAP_M = 0.2;

// Wide cells so "1 SG" fits; its own atlas, separate from the cast labels.
export function createPassTargetBadgeAtlas(opts: { texture?: THREE.Texture } = {}): LabelAtlas {
  return createLabelAtlas(PASS_TARGET_BADGE_LABELS, {
    texture: opts.texture,
    cellWidthPx: BADGE_CELL_WIDTH_PX,
  });
}

export interface PassTargetBadgeLayer {
  readonly object: THREE.Group;
  sync(players: readonly CharacterPose[], badges: readonly PassTargetBadge[]): void;
  dispose(): void;
}

// "<key> <role>" tags above teammates; the atlas is owned and disposed by the caller.
export function createPassTargetBadgeLayer(opts: {
  cast: CastContent;
  labels: LabelAtlas;
}): PassTargetBadgeLayer {
  const { cast, labels } = opts;
  const group = new THREE.Group();
  group.name = 'pass-target-badges';

  const material = new THREE.MeshBasicMaterial({
    map: labels.texture,
    transparent: true,
    alphaTest: 0.4,
    color: '#ffffff',
  });
  const backingMaterial = new THREE.MeshBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.75,
  });
  const pitch = THREE.MathUtils.degToRad(TACTICAL_PITCH_DEG);

  const meshes = new Map<number, THREE.Mesh>();
  for (const key of PASS_TARGET_KEYS) {
    const cell = labels.cell(passTargetBadgeLabel(key));
    const plane = new THREE.PlaneGeometry(BADGE_WIDTH_M, BADGE_HEIGHT_M);
    plane.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [cell.u0, cell.v1, cell.u1, cell.v1, cell.u0, cell.v0, cell.u1, cell.v0],
        2,
      ),
    );
    const mesh = new THREE.Mesh(plane, material);
    mesh.name = `pass-target-badge-${key}`;
    mesh.renderOrder = 1;
    mesh.rotation.x = -pitch;
    mesh.visible = false;

    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(BADGE_WIDTH_M * 1.1, BADGE_HEIGHT_M * 1.2),
      backingMaterial,
    );
    backing.name = `pass-target-badge-bg-${key}`;
    backing.position.z = -0.01;
    mesh.add(backing);

    meshes.set(key, mesh);
    group.add(mesh);
  }

  return {
    object: group,
    sync(players, badges) {
      for (const mesh of meshes.values()) mesh.visible = false;
      for (const badge of badges) {
        const pose = players.find((p) => p.id === badge.playerId);
        const mesh = meshes.get(badge.key);
        if (!pose || !mesh) continue;
        const heightM = cast.bodyTypes[cast.roles[badge.role].bodyType].heightM;
        mesh.position.set(pose.pos.x, heightM + BADGE_GAP_M + BADGE_HEIGHT_M / 2, pose.pos.z);
        mesh.visible = true;
      }
    },
    dispose() {
      disposeObject3D(group);
    },
  };
}
