import * as THREE from 'three';
import { createHelloCourtScene } from './helloCourt';

export function mountRenderer(container: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const { scene, camera } = createHelloCourtScene();

  const resize = (): void => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials: THREE.Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
