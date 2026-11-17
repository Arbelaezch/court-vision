/** Parses the `?stats` query flag: absent, `0` and `false` are off; a bare `?stats` is on. */
export function parseStatsFlag(value: string | null): boolean {
  return value !== null && value !== '0' && value !== 'false';
}

/** The slice of three's `WebGLRenderer.info` the overlay reads. */
export interface RendererStatsSource {
  render: { calls: number };
  memory: { geometries: number; textures: number };
}

export interface StatsOverlay {
  update(timeMs: number, info: RendererStatsSource): void;
  dispose(): void;
}

export function createStatsOverlay(opts: {
  container: HTMLElement;
  doc: Document;
  refreshMs?: number;
}): StatsOverlay {
  const refreshMs = opts.refreshMs ?? 500;
  const el = opts.doc.createElement('div');
  el.className = 'cv-stats';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position: fixed; top: 8px; right: 8px; padding: 2px 6px; font: 14px monospace; color: #fff; background: rgba(0,0,0,0.6); pointer-events: none';
  opts.container.appendChild(el);

  let disposed = false;
  let windowStart: number | null = null;
  let frames = 0;
  let fps: number | null = null;

  return {
    update(timeMs, info) {
      if (disposed) return;
      if (windowStart === null) windowStart = timeMs;
      frames += 1;
      const elapsed = timeMs - windowStart;
      if (elapsed >= refreshMs) {
        fps = Math.round((frames * 1000) / elapsed);
        frames = 0;
        windowStart = timeMs;
      }
      el.textContent = `FPS ${fps ?? '-'} | draw calls ${info.render.calls} | geometries ${info.memory.geometries} | textures ${info.memory.textures}`;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      el.remove();
    },
  };
}
