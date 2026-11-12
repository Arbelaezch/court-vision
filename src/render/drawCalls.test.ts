import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { countDrawCalls } from './drawCalls';

describe('countDrawCalls', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();

  it('counts visible meshes and non-empty instanced meshes only', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const hidden = new THREE.Mesh(geometry, material);
    hidden.visible = false;
    root.add(hidden);
    root.add(new THREE.InstancedMesh(geometry, material, 5));
    root.add(new THREE.InstancedMesh(geometry, material, 0));
    expect(countDrawCalls(root)).toBe(3);
  });

  it('counts one call per geometry group for material arrays', () => {
    const multi = new THREE.BoxGeometry(1, 1, 1);
    multi.clearGroups();
    multi.addGroup(0, 6, 0);
    multi.addGroup(6, 6, 1);
    const mesh = new THREE.Mesh(multi, [material, material]);
    expect(countDrawCalls(mesh)).toBe(2);
  });
});
