import * as THREE from 'three';
import type { PreviewRenderTarget } from './playPreview';

// Test helper (like src/app/storage/fakeStorage.ts); not exported from the render barrel.
// Mimics three.js info.memory: a resource counts once when first rendered and drops on its dispose event.
export class FakeMemoryRenderer implements PreviewRenderTarget {
  readonly info = { memory: { geometries: 0, textures: 0 } };
  private readonly seen = new Set<object>();

  private track(
    resource: THREE.EventDispatcher<{ dispose: object }>,
    key: 'geometries' | 'textures',
  ) {
    if (this.seen.has(resource)) return;
    this.seen.add(resource);
    this.info.memory[key] += 1;
    const onDispose = (): void => {
      this.info.memory[key] -= 1;
      this.seen.delete(resource);
      resource.removeEventListener('dispose', onDispose);
    };
    resource.addEventListener('dispose', onDispose);
  }

  render(scene: THREE.Scene): void {
    scene.traverse((o) => {
      const obj = o as THREE.Mesh;
      if (!obj.geometry || !obj.material) return;
      this.track(obj.geometry as THREE.BufferGeometry, 'geometries');
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) this.track(value, 'textures');
        }
      }
    });
  }
}
