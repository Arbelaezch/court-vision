import * as THREE from 'three';

// Estimates the draw calls needed to render root: one per visible mesh/line/points object
// (one per geometry group when the material is an array). Empty instanced meshes cost nothing.
export function countDrawCalls(root: THREE.Object3D): number {
  let calls = 0;
  root.traverseVisible((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Points)
    ) {
      return;
    }
    if (object instanceof THREE.InstancedMesh && object.count === 0) return;
    const material: THREE.Material | THREE.Material[] = object.material;
    calls += Array.isArray(material) ? Math.max(1, object.geometry.groups.length) : 1;
  });
  return calls;
}
