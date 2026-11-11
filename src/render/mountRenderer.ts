import * as THREE from 'three';
import { createCourtScene } from './courtScene';
import { disposeObject3D } from './dispose';
import { fitTacticalCamera } from './tacticalCamera';
import { bindVisibilityPause } from './visibilityPause';

export function mountRenderer(container: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const { scene, camera } = createCourtScene();

  const resize = (): void => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);
    fitTacticalCamera(camera, width / height);
  };
  resize();
  window.addEventListener('resize', resize);

  const frame = (): void => renderer.render(scene, camera);
  const unbindVisibility = bindVisibilityPause({
    target: document,
    isHidden: () => document.hidden,
    onPause: () => renderer.setAnimationLoop(null),
    onResume: () => renderer.setAnimationLoop(frame),
  });

  return () => {
    unbindVisibility();
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    disposeObject3D(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}
