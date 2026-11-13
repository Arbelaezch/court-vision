import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadCastContent, loadSimMovement } from '../content';
import { PASS_TARGET_KEYS, createGame, passTargetBadges } from '../sim';
import { characterFitHeight } from './characters';
import type { CharacterPose } from './characters';
import {
  BADGE_GAP_M,
  BADGE_HEIGHT_M,
  createPassTargetBadgeAtlas,
  createPassTargetBadgeLayer,
} from './passTargetBadges';

function setup() {
  const cast = loadCastContent();
  const game = createGame({ seed: 1, movement: loadSimMovement() });
  const atlas = createPassTargetBadgeAtlas({ texture: new THREE.Texture() });
  const layer = createPassTargetBadgeLayer({ cast, labels: atlas });
  const poses: CharacterPose[] = game.players.map((p) => ({ id: p.id, pos: p.pos, vel: p.vel }));
  return { cast, game, atlas, layer, poses };
}

function badgeMesh(layer: { object: THREE.Group }, key: number): THREE.Mesh {
  return layer.object.getObjectByName(`pass-target-badge-${key}`) as THREE.Mesh;
}

function visibleBadges(layer: { object: THREE.Group }): THREE.Object3D[] {
  return layer.object.children.filter((c) => c.name.startsWith('pass-target-badge-') && c.visible);
}

describe('createPassTargetBadgeLayer', () => {
  it('shows four badges over their teammates, above body height', () => {
    const { cast, game, layer, poses } = setup();
    layer.sync(poses, passTargetBadges(game));
    expect(visibleBadges(layer)).toHaveLength(4);
    for (const badge of passTargetBadges(game)) {
      const player = game.players.find((p) => p.id === badge.playerId)!;
      const mesh = badgeMesh(layer, badge.key);
      expect(mesh.position.x).toBe(player.pos.x);
      expect(mesh.position.z).toBe(player.pos.z);
      const heightM = cast.bodyTypes[cast.roles[player.role].bodyType].heightM;
      expect(mesh.position.y).toBeGreaterThan(heightM);
    }
    const c = game.players.find((p) => p.side === 'offense' && p.role === 'C')!;
    const pf = game.players.find((p) => p.side === 'offense' && p.role === 'PF')!;
    expect(badgeMesh(layer, 4).position.x).toBe(c.pos.x);
    expect(badgeMesh(layer, 3).position.x).toBe(pf.pos.x);
  });

  it('pairs number and role in the atlas cell', () => {
    const { atlas, layer } = setup();
    const cell = atlas.cell('4 C');
    const uv = badgeMesh(layer, 4).geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(cell.u0, 6);
    expect(uv.getY(0)).toBeCloseTo(cell.v1, 6);
    expect(uv.getX(3)).toBeCloseTo(cell.u1, 6);
    expect(uv.getY(3)).toBeCloseTo(cell.v0, 6);
  });

  it('hides every badge on an empty sync and shows them again later', () => {
    const { game, layer, poses } = setup();
    layer.sync(poses, passTargetBadges(game));
    layer.sync(poses, []);
    expect(visibleBadges(layer)).toHaveLength(0);
    layer.sync(poses, passTargetBadges(game));
    expect(visibleBadges(layer)).toHaveLength(PASS_TARGET_KEYS.length);
  });

  it('keeps the tallest badge top inside the fit height', () => {
    const { cast } = setup();
    let tallest = 0;
    for (const spec of Object.values(cast.bodyTypes)) tallest = Math.max(tallest, spec.heightM);
    expect(tallest + BADGE_GAP_M + BADGE_HEIGHT_M).toBeLessThanOrEqual(
      characterFitHeight(cast.bodyTypes),
    );
  });

  it('disposes without throwing', () => {
    const { layer } = setup();
    expect(() => layer.dispose()).not.toThrow();
  });
});
