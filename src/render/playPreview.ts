import * as THREE from 'three';
import type { PreviewDrawFrame } from '../app/playPreviewSession';
import type { CastContent } from '../content';
import { characterFitHeight } from './characters';
import { createCourtScene } from './courtScene';
import { disposeObject3D } from './dispose';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import { createPassTargetBadgeAtlas } from './passTargetBadges';
import { fitTacticalCamera } from './tacticalCamera';

export interface PreviewRenderTarget {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export interface PlayPreviewView {
  draw(frame: PreviewDrawFrame): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

// The Play Select preview scene (g9): one court, one live run view, redrawn from the preview session.
// Switching plays clears the previous play's run objects so GPU resources do not accumulate.
export function createPlayPreviewView(opts: {
  cast: CastContent;
  target: PreviewRenderTarget;
  textures?: { labels: THREE.Texture; badges: THREE.Texture };
}): PlayPreviewView {
  const { cast, target, textures } = opts;
  const topHeight = characterFitHeight(cast.bodyTypes);
  const { scene, camera } = createCourtScene({ topHeight });
  const labels = createLabelAtlas(
    collectCastLabels(cast.teams),
    textures ? { texture: textures.labels } : undefined,
  );
  const badgeLabels = createPassTargetBadgeAtlas(textures ? { texture: textures.badges } : {});
  const view = createLiveRunView({ scene, cast, labels, badgeLabels });
  let lastPlayId: string | null = null;
  let disposed = false;

  return {
    draw(frame) {
      if (disposed) throw new Error('Court Vision: play preview view is disposed');
      if (lastPlayId !== null && lastPlayId !== frame.playId) view.clear();
      lastPlayId = frame.playId;
      view.drawGame({ game: frame.game, humanRole: frame.humanRole, steps: frame.steps, cues: [] });
      target.render(scene, camera);
    },
    resize(width, height) {
      fitTacticalCamera(camera, width / height, topHeight);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      view.dispose();
      labels.dispose();
      badgeLabels.dispose();
      disposeObject3D(scene);
    },
  };
}
