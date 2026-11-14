import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadCastContent, loadSimMovement } from '../content';
import { createGame } from '../sim';
import { createPracticeCones } from './cones';
import type { ConeSpot } from './cones';
import { countDrawCalls } from './drawCalls';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { OUTLINE_THICKNESS_M } from './toon';

const cast = loadCastContent();
const game = createGame({ seed: 1, movement: loadSimMovement() });
const spots: ConeSpot[] = game.players
  .filter((p) => p.side === 'defense')
  .map((p) => ({ role: p.role, x: p.pos.x, z: p.pos.z }));
const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: new THREE.Texture() });

function expectColor(actual: THREE.Color, hex: string): void {
  const want = new THREE.Color(hex);
  expect(actual.r).toBeCloseTo(want.r, 5);
  expect(actual.g).toBeCloseTo(want.g, 5);
  expect(actual.b).toBeCloseTo(want.b, 5);
}

function bodies(teams = cast.teams): THREE.InstancedMesh {
  const cones = createPracticeCones({ teams, cones: spots, labels });
  return cones.object.getObjectByName('cone-bodies') as THREE.InstancedMesh;
}

describe('practice cones', () => {
  it('draws one instance per cone in the defense primary', () => {
    const mesh = bodies();
    expect(mesh.count).toBe(5);
    expect(mesh.geometry).toBeInstanceOf(THREE.ConeGeometry);
    const c = new THREE.Color();
    mesh.getColorAt(0, c);
    expectColor(c, cast.teams.defense.colors.primary);
  });

  it('follows the cast: a changed defense primary changes the cone color', () => {
    const teams = {
      ...cast.teams,
      defense: {
        ...cast.teams.defense,
        colors: { ...cast.teams.defense.colors, primary: '#00aa00' },
      },
    };
    const c = new THREE.Color();
    bodies(teams).getColorAt(2, c);
    expectColor(c, '#00aa00');
  });

  it('labels each cone with its role id above the cone', () => {
    const cones = createPracticeCones({ teams: cast.teams, cones: spots, labels });
    const label = cones.object.getObjectByName('cone-label-C') as THREE.Mesh;
    const spot = spots.find((s) => s.role === 'C')!;
    expect(label.position.x).toBe(spot.x);
    expect(label.position.z).toBe(spot.z);
    expect(label.position.y).toBeGreaterThan(0.6);

    const cell = labels.cell('C');
    const uv = label.geometry.getAttribute('uv');
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...us)).toBeCloseTo(cell.u0, 6);
    expect(Math.max(...us)).toBeCloseTo(cell.u1, 6);
    expect(Math.min(...vs)).toBeCloseTo(cell.v0, 6);
    expect(Math.max(...vs)).toBeCloseTo(cell.v1, 6);
    expectColor(
      (label.material as THREE.MeshBasicMaterial).color,
      cast.teams.defense.colors.secondary,
    );
  });

  it('grows the outline hull below the floor and outward by the thickness', () => {
    const cones = createPracticeCones({ teams: cast.teams, cones: spots, labels });
    const body = cones.object.getObjectByName('cone-bodies') as THREE.InstancedMesh;
    const hull = cones.object.getObjectByName('cone-outlines') as THREE.InstancedMesh;
    const box = (mesh: THREE.InstancedMesh): THREE.Box3 => {
      mesh.geometry.computeBoundingBox();
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(0, m);
      return mesh.geometry.boundingBox!.clone().applyMatrix4(m);
    };
    const part = box(body);
    const outer = box(hull);
    expect(outer.min.y).toBeLessThan(0);
    const dw = outer.getSize(new THREE.Vector3()).x - part.getSize(new THREE.Vector3()).x;
    expect(dw).toBeCloseTo(2 * OUTLINE_THICKNESS_M, 5);
  });

  it('stays within the draw-call budget and disposes cleanly', () => {
    const cones = createPracticeCones({ teams: cast.teams, cones: spots, labels });
    expect(countDrawCalls(cones.object)).toBeLessThanOrEqual(8);
    expect(() => cones.dispose()).not.toThrow();
  });

  it('sync moves the instance matrix and label of a cone', () => {
    const cones = createPracticeCones({ teams: cast.teams, cones: spots, labels });
    const role = spots[0]!.role;
    cones.sync(spots.map((s) => (s.role === role ? { ...s, x: 3, z: -2 } : s)));
    const body = cones.object.getObjectByName('cone-bodies') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    body.getMatrixAt(0, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    expect(pos.x).toBe(3);
    expect(pos.z).toBe(-2);
    const label = cones.object.getObjectByName(`cone-label-${role}`) as THREE.Mesh;
    expect(label.position.x).toBe(3);
    expect(label.position.z).toBe(-2);
  });

  it('sync throws on an unknown or missing role', () => {
    const cones = createPracticeCones({ teams: cast.teams, cones: spots, labels });
    expect(() => cones.sync(spots.slice(1))).toThrow(/every cone role/);
    expect(() => cones.sync([...spots.slice(1), { role: 'XX' as never, x: 0, z: 0 }])).toThrow(
      /unknown cone role/,
    );
  });

  it('rejects duplicate roles', () => {
    expect(() =>
      createPracticeCones({ teams: cast.teams, cones: [spots[0]!, spots[0]!], labels }),
    ).toThrow(/duplicate/);
  });
});
