import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadCastContent, loadSimMovement } from '../content';
import type { CastContent } from '../content';
import { createGame } from '../sim';
import {
  bodyProportions,
  createCharacterLayer,
  MARKER_TOP_OFFSET_M,
  type CharacterLayer,
  type CharacterPose,
} from './characters';
import type { AnimState } from './animation';
import { OUTLINE_THICKNESS_M } from './toon';
import { countDrawCalls } from './drawCalls';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';

const cast = loadCastContent();
const game = createGame({ seed: 1, movement: loadSimMovement() });
const roster = game.players.map((p) => ({ id: p.id, side: p.side, role: p.role }));
const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: new THREE.Texture() });

function build(c: CastContent = cast): CharacterLayer {
  const layer = createCharacterLayer({ cast: c, roster, labels });
  layer.sync(game.players, 0);
  return layer;
}

function find<T extends THREE.Object3D>(layer: CharacterLayer, name: string): T {
  const found = layer.object.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found as T;
}

// World-space bounding box of one instance, using the unit geometry's bounds.
function instanceBox(mesh: THREE.InstancedMesh, index: number): THREE.Box3 {
  mesh.geometry.computeBoundingBox();
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return mesh.geometry.boundingBox!.clone().applyMatrix4(m);
}

describe('character layer', () => {
  it('creates instanced parts and outline twins with expected counts', () => {
    const layer = build();
    const counts: Record<string, number> = {
      'character-heads': 10,
      'character-bodies': 20,
      'character-limbs': 40,
    };
    for (const [name, count] of Object.entries(counts)) {
      expect(find<THREE.InstancedMesh>(layer, name).count).toBe(count);
      expect(find<THREE.InstancedMesh>(layer, `${name}-outline`).count).toBe(count);
    }
  });

  it('colors torsos with the team primary', () => {
    const layer = build();
    const bodies = find<THREE.InstancedMesh>(layer, 'character-bodies');
    const c = new THREE.Color();
    // Instance colors are stored as float32, so compare per channel with tolerance.
    const expectColor = (index: number, hex: string): void => {
      bodies.getColorAt(index, c);
      const want = new THREE.Color(hex);
      expect(c.r).toBeCloseTo(want.r, 5);
      expect(c.g).toBeCloseTo(want.g, 5);
      expect(c.b).toBeCloseTo(want.b, 5);
    };
    expectColor(0, cast.teams.offense.colors.primary);
    expectColor(10, cast.teams.defense.colors.primary);
  });

  it('makes the C taller and broader than the PG from data', () => {
    const layer = build();
    const heads = find<THREE.InstancedMesh>(layer, 'character-heads');
    const bodies = find<THREE.InstancedMesh>(layer, 'character-bodies');
    expect(instanceBox(heads, 4).max.y - instanceBox(heads, 0).max.y).toBeGreaterThanOrEqual(0.3);
    const pgWidth = instanceBox(bodies, 0).getSize(new THREE.Vector3()).x;
    const cWidth = instanceBox(bodies, 8).getSize(new THREE.Vector3()).x;
    expect(cWidth).toBeGreaterThan(pgWidth);
  });

  it('follows the body type chosen in role data', () => {
    const bigPg: CastContent = {
      ...cast,
      roles: { ...cast.roles, PG: { ...cast.roles.PG, bodyType: 'big' } },
    };
    const layer = build(bigPg);
    const heads = find<THREE.InstancedMesh>(layer, 'character-heads');
    expect(instanceBox(heads, 0).max.y).toBeCloseTo(instanceBox(heads, 4).max.y, 6);
  });

  it('puts the head top at the body height', () => {
    const p = bodyProportions(cast.bodyTypes.guard);
    expect(p.headCenterY + p.headRadius).toBeCloseTo(cast.bodyTypes.guard.heightM, 10);
  });

  it('maps jersey numbers to atlas cells', () => {
    const layer = build();
    for (const [id, label] of [
      [0, '3'],
      [9, '44'],
    ] as const) {
      const uv = find<THREE.Mesh>(layer, `jersey-${id}`).geometry.getAttribute('uv');
      const cell = labels.cell(label);
      const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
      const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
      expect(Math.min(...us)).toBeCloseTo(cell.u0, 6);
      expect(Math.max(...us)).toBeCloseTo(cell.u1, 6);
      expect(Math.min(...vs)).toBeCloseTo(cell.v0, 6);
      expect(Math.max(...vs)).toBeCloseTo(cell.v1, 6);
    }
  });

  it('shows the controlled marker above the controlled player and hides it on null', () => {
    const layer = build();
    const marker = find<THREE.Mesh>(layer, 'controlled-marker');
    expect((marker.geometry as THREE.ConeGeometry).parameters.radialSegments).toBe(4);
    expect(marker.visible).toBe(true);
    const heads = find<THREE.InstancedMesh>(layer, 'character-heads');
    expect(marker.position.y).toBeGreaterThan(instanceBox(heads, 0).max.y);

    layer.sync(game.players, 4);
    const c = game.players[4]!;
    expect(marker.position.x).toBeCloseTo(c.pos.x, 6);
    expect(marker.position.z).toBeCloseTo(c.pos.z, 6);

    layer.sync(game.players, null);
    expect(marker.visible).toBe(false);
  });

  it('grows outline hulls by the thickness on each side for heads, legs and torsos', () => {
    const layer = build();
    const width = (name: string, index: number): number =>
      instanceBox(find<THREE.InstancedMesh>(layer, name), index).getSize(new THREE.Vector3()).x;
    for (const [name, index] of [
      ['character-heads', 0],
      ['character-limbs', 0],
      ['character-bodies', 0],
    ] as const) {
      expect(width(`${name}-outline`, index) - width(name, index)).toBeCloseTo(
        2 * OUTLINE_THICKNESS_M,
        5,
      );
    }
  });

  it('hides every part and jersey until sync supplies a pose', () => {
    const layer = createCharacterLayer({ cast, roster, labels });
    const heads = find<THREE.InstancedMesh>(layer, 'character-heads');
    expect(instanceBox(heads, 0).getSize(new THREE.Vector3()).x).toBe(0);
    expect(find<THREE.Mesh>(layer, 'jersey-0').visible).toBe(false);
    layer.sync(game.players, 0);
    expect(instanceBox(heads, 0).getSize(new THREE.Vector3()).x).toBeGreaterThan(0);
    expect(find<THREE.Mesh>(layer, 'jersey-0').visible).toBe(true);
  });

  it('keeps the marker outline within the marker top offset', () => {
    const layer = build();
    layer.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(find<THREE.Mesh>(layer, 'controlled-marker-outline'));
    const height = cast.bodyTypes[cast.roles[roster[0]!.role].bodyType].heightM;
    expect(box.max.y).toBeLessThanOrEqual(height + MARKER_TOP_OFFSET_M);
  });

  it('stays within the draw-call budget and disposes cleanly', () => {
    const layer = build();
    expect(countDrawCalls(layer.object)).toBeLessThanOrEqual(30);
    expect(() => layer.dispose()).not.toThrow();
  });

  it('rejects duplicate roster ids', () => {
    expect(() =>
      createCharacterLayer({ cast, roster: [roster[0]!, roster[0]!], labels }),
    ).toThrow(/duplicate/);
  });
});

describe('character animation', () => {
  const guard = bodyProportions(cast.bodyTypes[cast.roles[roster[0]!.role].bodyType]);
  const limbsOf = (layer: CharacterLayer): THREE.InstancedMesh =>
    find<THREE.InstancedMesh>(layer, 'character-limbs');
  const withAnim = (anim: AnimState): CharacterPose[] =>
    game.players.map((p, i) => (i === 0 ? { ...p, anim } : p));
  const stepped = (anim: AnimState, steps: number, dt: number, controlled = 0): CharacterLayer => {
    const layer = createCharacterLayer({ cast, roster, labels });
    const poses = withAnim(anim);
    layer.sync(poses, controlled, 0);
    for (let i = 0; i < steps; i++) layer.sync(poses, controlled, dt);
    return layer;
  };

  it('keeps legs vertical on the floor at the neutral pose', () => {
    const layer = build();
    const box = instanceBox(limbsOf(layer), 0);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(guard.legLength, 6);

    const other = createCharacterLayer({ cast, roster, labels });
    other.sync(game.players, 0, 0);
    for (const name of ['character-limbs', 'character-bodies']) {
      expect(Array.from(find<THREE.InstancedMesh>(other, name).instanceMatrix.array)).toEqual(
        Array.from(find<THREE.InstancedMesh>(layer, name).instanceMatrix.array),
      );
    }
  });

  it('advances with dt and holds still at dt 0', () => {
    const layer = build();
    const poses = game.players.map((p) => ({ ...p, vel: { x: 0, z: -5 }, anim: 'run' as const }));
    layer.sync(poses, 0, 0);
    const before = Array.from(limbsOf(layer).instanceMatrix.array);
    layer.sync(poses, 0, 0.1);
    const after = Array.from(limbsOf(layer).instanceMatrix.array);
    expect(after).not.toEqual(before);
    layer.sync(poses, 0, 0);
    expect(Array.from(limbsOf(layer).instanceMatrix.array)).toEqual(after);
  });

  it('raises both arms above the head when celebrating', () => {
    const layer = createCharacterLayer({ cast, roster, labels });
    layer.sync(withAnim('celebrate'), 0, 0);
    const headTop = instanceBox(find<THREE.InstancedMesh>(layer, 'character-heads'), 0).max.y;
    expect(instanceBox(limbsOf(layer), 2).max.y).toBeGreaterThan(headTop);
    expect(instanceBox(limbsOf(layer), 3).max.y).toBeGreaterThan(headTop);
  });

  it('keeps the outline twin of a rotated limb in lockstep', () => {
    const layer = createCharacterLayer({ cast, roster, labels });
    layer.sync(withAnim('celebrate'), 0, 0);
    const a = instanceBox(limbsOf(layer), 3).getCenter(new THREE.Vector3());
    const b = instanceBox(
      find<THREE.InstancedMesh>(layer, 'character-limbs-outline'),
      3,
    ).getCenter(new THREE.Vector3());
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-5);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-5);
    expect(Math.abs(a.z - b.z)).toBeLessThan(1e-5);
  });

  it('moves the jersey with the torso', () => {
    const layer = stepped('disappointed', 10, 0.05);
    const jersey = find<THREE.Mesh>(layer, 'jersey-0');
    const torso = new THREE.Matrix4();
    find<THREE.InstancedMesh>(layer, 'character-bodies').getMatrixAt(0, torso);
    const centre = new THREE.Vector3(0, guard.torsoCenterY, 0).applyMatrix4(jersey.matrix);
    const want = new THREE.Vector3().setFromMatrixPosition(torso);
    expect(centre.distanceTo(want)).toBeLessThan(1e-6);

    const idle = build();
    expect(Array.from(jersey.matrix.elements)).not.toEqual(
      Array.from(find<THREE.Mesh>(idle, 'jersey-0').matrix.elements),
    );
  });

  it('keeps feet on the floor while crouching', () => {
    const layer = stepped('screen', 20, 0.05);
    for (const i of [0, 1]) expect(instanceBox(limbsOf(layer), i).min.y).toBeGreaterThan(-1e-3);
  });

  it.each([
    ['run', 5],
    ['sprint', 8],
  ] as const)('plants the lower foot while %s', (anim, speed) => {
    const layer = createCharacterLayer({ cast, roster, labels });
    const poses = game.players.map((p, i) =>
      i === 0 ? { ...p, vel: { x: 0, z: -speed }, anim } : p,
    );
    layer.sync(poses, 0, 0);
    for (let i = 0; i < 60; i++) {
      layer.sync(poses, 0, 0.02);
      const low = Math.min(
        instanceBox(limbsOf(layer), 0).min.y,
        instanceBox(limbsOf(layer), 1).min.y,
      );
      expect(low).toBeGreaterThan(-0.015);
      expect(low).toBeLessThan(0.015);
    }
  });

  it('keeps the marker at a fixed height above the hips while jumping', () => {
    const layer = createCharacterLayer({ cast, roster, labels });
    const poses = withAnim('shoot');
    const marker = find<THREE.Mesh>(layer, 'controlled-marker');
    const hips = find<THREE.InstancedMesh>(layer, 'character-bodies');
    layer.sync(poses, 0, 0);
    const gap = (): number =>
      marker.position.y - instanceBox(hips, 1).getCenter(new THREE.Vector3()).y;
    const first = gap();
    for (let i = 0; i < 30; i++) {
      layer.sync(poses, 0, 0.05);
      expect(Math.abs(gap() - first)).toBeLessThan(1e-6);
    }
  });
});
