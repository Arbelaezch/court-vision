import * as THREE from 'three';

// Disposes every unique geometry and material under root exactly once (materials are shared).
export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      const list: THREE.Material[] = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of list) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
