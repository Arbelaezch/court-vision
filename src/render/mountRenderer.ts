import * as THREE from 'three';
import { createCourtScene } from './courtScene';
import { createDevScene } from './devView';
import type { DevView } from './devView';
import { disposeObject3D } from './dispose';
import { loadCastContent } from '../content';
import { createCuePromptOverlay } from '../ui';
import { characterFitHeight } from './characters';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import type { LiveRunView } from './liveRunView';
import { createPassTargetBadgeAtlas } from './passTargetBadges';
import { clientToNdc, fitTacticalCamera, screenToCourt } from './tacticalCamera';
import { bindVisibilityPause } from './visibilityPause';
import type { CourtPoint } from '../sim';

export interface MountedRenderer {
  dispose(): void;
  /** The live run view; null in dev views. */
  run: LiveRunView | null;
  /** Court position under a client pixel, or null when it misses the floor. */
  pointerToCourt(clientX: number, clientY: number): CourtPoint | null;
}

export function mountRenderer(
  container: HTMLElement,
  opts: { dev?: DevView | null } = {},
): MountedRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const devScene = opts.dev ? createDevScene(opts.dev) : null;
  let liveAtlases: Array<{ dispose(): void }> = [];
  let run: LiveRunView | null = null;
  let courtScene: ReturnType<typeof createCourtScene>;
  let topHeight: number | undefined = devScene?.topHeight;
  if (devScene) {
    courtScene = devScene;
  } else {
    const cast = loadCastContent();
    topHeight = characterFitHeight(cast.bodyTypes);
    courtScene = createCourtScene({ topHeight });
    const labels = createLabelAtlas(collectCastLabels(cast.teams));
    const badgeLabels = createPassTargetBadgeAtlas();
    liveAtlases = [labels, badgeLabels];
    run = createLiveRunView({ scene: courtScene.scene, cast, labels, badgeLabels });
  }
  const { scene, camera } = courtScene;

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
  const promptOverlay = devScene ? createCuePromptOverlay({ container, doc: document }) : null;
  let shownStatus: string | null = null;

  let loggedDrawCalls = false;
  let lastMs: number | null = null;
  const frame = (timeMs: number): void => {
    const dt = lastMs === null ? 0 : (timeMs - lastMs) / 1000;
    lastMs = timeMs;
    if (devScene) {
      devScene.update(dt);
      promptOverlay?.show(devScene.prompt());
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

  return {
    run,
    pointerToCourt(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return null;
      return screenToCourt(camera, clientToNdc(clientX, clientY, rect));
    },
    dispose() {
      unbindVisibility();
      renderer.setAnimationLoop(null);
      overlay?.remove();
      promptOverlay?.dispose();
      window.removeEventListener('resize', resize);
      run?.dispose();
      for (const atlas of liveAtlases) atlas.dispose();
      if (devScene) devScene.dispose();
      else disposeObject3D(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
