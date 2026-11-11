import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject3D } from './dispose';

describe('disposeObject3D', () => {
  it('disposes each unique geometry and material exactly once', () => {
    const sharedGeometry = new THREE.BoxGeometry();
    const sharedMaterial = new THREE.MeshBasicMaterial();
    const ownGeometry = new THREE.PlaneGeometry();
    const ownMaterial = new THREE.MeshBasicMaterial();
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(sharedGeometry, sharedMaterial),
      new THREE.Mesh(sharedGeometry, sharedMaterial),
      new THREE.Mesh(ownGeometry, ownMaterial),
    );
    const spies = [sharedGeometry, sharedMaterial, ownGeometry, ownMaterial].map((x) =>
      vi.spyOn(x, 'dispose'),
    );

    disposeObject3D(group);

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
