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

  let overlay: HTMLDivElement | null = null;
  if (devScene?.status() != null) {
    overlay = document.createElement('div');
    overlay.className = 'dev-status';
    overlay.style.cssText =
      'position: fixed; top: 8px; left: 8px; padding: 2px 6px; font: 14px monospace; color: #fff; background: rgba(0,0,0,0.6); pointer-events: none';
    container.appendChild(overlay);
  }
  let shownStatus: string | null = null;

  let loggedDrawCalls = false;
  let lastMs: number | null = null;
  const frame = (timeMs: number): void => {
    const dt = lastMs === null ? 0 : (timeMs - lastMs) / 1000;
    lastMs = timeMs;
    if (devScene) {
      devScene.update(dt);
      const status = devScene.status();
      if (overlay && status !== shownStatus) {
        shownStatus = status;
        overlay.textContent = `animation: ${status}`;
      }
    }
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
    onResume: () => {
      lastMs = null;
      renderer.setAnimationLoop(frame);
    },
  });

  return () => {
    unbindVisibility();
    renderer.setAnimationLoop(null);
    overlay?.remove();
    window.removeEventListener('resize', resize);
    if (devScene) devScene.dispose();
    else disposeObject3D(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}
