import * as THREE from 'three';

// Half-thickness of the inverted-hull outline, in meters, added on each side of a part.
export const OUTLINE_THICKNESS_M = 0.025;

const GRADIENT_STEPS = [80, 170, 255];

// One shared toon material (white base so per-instance colors drive it) with a 3-step ramp.
export function createToonMaterial(): {
  material: THREE.MeshToonMaterial;
  gradient: THREE.DataTexture;
} {
  const gradient = new THREE.DataTexture(
    new Uint8Array(GRADIENT_STEPS),
    GRADIENT_STEPS.length,
    1,
    THREE.RedFormat,
  );
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient });
  return { material, gradient };
}

export function createOutlineMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
}

// Per-axis factor that grows a part of the given size by the outline thickness on every side.
export function outlineScale(size: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    (size.x + 2 * OUTLINE_THICKNESS_M) / size.x,
    (size.y + 2 * OUTLINE_THICKNESS_M) / size.y,
    (size.z + 2 * OUTLINE_THICKNESS_M) / size.z,
  );
}
