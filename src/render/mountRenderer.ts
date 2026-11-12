import * as THREE from 'three';
import { createCourtScene } from './courtScene';
import { createDevScene } from './devView';
import type { DevView } from './devView';
import { disposeObject3D } from './dispose';
import { fitTacticalCamera } from './tacticalCamera';
import { bindVisibilityPause } from './visibilityPause';

export function mountRenderer(
  container: HTMLElement,
  opts: { dev?: DevView | null } = {},
): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const devScene = opts.dev ? createDevScene(opts.dev) : null;
  const { scene, camera } = devScene ?? createCourtScene();
  const topHeight = devScene?.topHeight;

  const resize = (): void => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);
    fitTacticalCamera(camera, width / height, topHeight);
  };
  resize();
  window.addEventListener('resize', resize);

  let loggedDrawCalls = false;
  const frame = (): void => {
    renderer.render(scene, camera);
    if (devScene && !loggedDrawCalls) {
      loggedDrawCalls = true;
      console.info('[court-vision] draw calls:', renderer.info.render.calls);
    }
  };
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
    if (devScene) devScene.dispose();
    else disposeObject3D(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}
