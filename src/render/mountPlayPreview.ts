import * as THREE from 'three';
import type { PreviewDrawFrame } from '../app/playPreviewSession';
import type { CastContent } from '../content';
import { createPlayPreviewView } from './playPreview';
import type { PreviewRenderTarget } from './playPreview';
import { bindVisibilityPause } from './visibilityPause';

export const PREVIEW_WIDTH_PX = 320;
export const PREVIEW_HEIGHT_PX = 180;

export interface PreviewCanvasRenderer extends PreviewRenderTarget {
  domElement: HTMLElement;
  setSize(w: number, h: number): void;
  setAnimationLoop(cb: ((timeMs: number) => void) | null): void;
  dispose(): void;
}

export interface PlayPreviewSource {
  select(playId: string): void;
  frame(frameDeltaMs: number): PreviewDrawFrame | null;
  stop(): void;
}

export interface PlayPreviewHandle {
  show(playId: string): void;
  unmount(): void;
}

export interface PlayPreviewMount {
  mount(parent: HTMLElement): PlayPreviewHandle;
  dispose(): void;
}

function createDefaultRenderer(): PreviewCanvasRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer as unknown as PreviewCanvasRenderer;
}

// One small preview viewport at a time (g11). The renderer is created lazily and reused across mounts.
export function mountPlayPreview(opts: {
  doc: Document;
  cast: CastContent;
  source: PlayPreviewSource;
  visibility: { target: EventTarget; isHidden: () => boolean };
  createRenderer?: () => PreviewCanvasRenderer;
  /** Test seam: inject atlas textures (no canvas in node). */
  textures?: { labels: THREE.Texture; badges: THREE.Texture };
}): PlayPreviewMount {
  const { doc, cast, source, visibility } = opts;
  const createRenderer = opts.createRenderer ?? createDefaultRenderer;
  let renderer: PreviewCanvasRenderer | null = null;
  let current: PlayPreviewHandle | null = null;

  return {
    mount(parent) {
      current?.unmount();
      renderer ??= createRenderer();
      const r = renderer;

      const canvas = r.domElement;
      canvas.className = 'cv-play-preview-canvas';
      const label = doc.createElement('p');
      label.className = 'cv-play-preview-label';
      canvas.setAttribute('aria-hidden', 'true');
      parent.appendChild(canvas);
      parent.appendChild(label);

      r.setSize(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
      const view = createPlayPreviewView({
        cast,
        target: r,
        ...(opts.textures ? { textures: opts.textures } : {}),
      });
      view.resize(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);

      let lastMs: number | null = null;
      let shownLabel: string | null = null;
      const frame = (timeMs: number): void => {
        const dtMs = lastMs === null ? 0 : timeMs - lastMs;
        lastMs = timeMs;
        const f = source.frame(dtMs);
        if (f === null) return;
        view.draw(f);
        if (f.coverageLabel !== shownLabel) {
          shownLabel = f.coverageLabel;
          label.textContent = f.coverageLabel;
        }
      };
      const unbindVisibility = bindVisibilityPause({
        target: visibility.target,
        isHidden: visibility.isHidden,
        onPause: () => r.setAnimationLoop(null),
        onResume: () => {
          lastMs = null;
          r.setAnimationLoop(frame);
        },
      });

      let mounted = true;
      const handle: PlayPreviewHandle = {
        show(playId) {
          if (mounted) source.select(playId);
        },
        unmount() {
          if (!mounted) return;
          mounted = false;
          r.setAnimationLoop(null);
          unbindVisibility();
          view.dispose();
          source.stop();
          canvas.remove();
          label.remove();
          if (current === handle) current = null;
        },
      };
      current = handle;
      return handle;
    },
    dispose() {
      current?.unmount();
      renderer?.dispose();
      renderer = null;
    },
  };
}
