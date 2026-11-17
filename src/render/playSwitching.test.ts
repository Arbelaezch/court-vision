import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  bootApp,
  createPlayPreviewSession,
  createSaveStore,
  loadAppContent,
  sortPlayList,
} from '../app';
import { createFakeStorage } from '../app/storage/fakeStorage';
import { loadCastContent } from '../content';
import { characterFitHeight } from './characters';
import { createCourtScene } from './courtScene';
import { FakeMemoryRenderer } from './fakeMemoryRenderer';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import { mountPlayPreview } from './mountPlayPreview';
import type { PreviewCanvasRenderer } from './mountPlayPreview';
import { createPassTargetBadgeAtlas } from './passTargetBadges';

const CONTENT = loadAppContent();
const cast = loadCastContent();
const ROUNDS = 20;
// The label and badge atlas textures live as long as the run view: they appear on the first run draw and never grow.
const ATLAS_TEXTURES = 2;
const MODES = ['openPractice', 'openScrimmage'] as const;

class FakeEl {
  className = '';
  textContent = '';
  parent: FakeEl | null = null;
  readonly children: FakeEl[] = [];
  appendChild(child: FakeEl): FakeEl {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  setAttribute(): void {}
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

type Counts = Record<string, number>;

/** Wraps add/removeEventListener on a target and keeps a net count per event type. */
function countListeners(target: EventTarget): () => Counts {
  const net: Counts = {};
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = ((type: string, ...rest: unknown[]) => {
    net[type] = (net[type] ?? 0) + 1;
    return (add as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof target.addEventListener;
  target.removeEventListener = ((type: string, ...rest: unknown[]) => {
    net[type] = (net[type] ?? 0) - 1;
    return (remove as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof target.removeEventListener;
  return () => Object.fromEntries(Object.entries(net).filter(([, n]) => n !== 0));
}

function setup() {
  const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
  const { scene } = createCourtScene({ topHeight: characterFitHeight(cast.bodyTypes) });
  const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: new THREE.Texture() });
  const badgeLabels = createPassTargetBadgeAtlas({ texture: new THREE.Texture() });
  const run = createLiveRunView({ scene, cast, labels, badgeLabels });
  const runMemory = new FakeMemoryRenderer();
  const previewMemory = new FakeMemoryRenderer();

  const runTarget = new EventTarget();
  const previewTarget = new EventTarget();
  const runListeners = countListeners(runTarget);
  const previewListeners = countListeners(previewTarget);

  const flow = bootApp({
    store,
    renderer: { drawRun: (c, f) => run.draw(c, f), clear: () => run.clear() },
    seed: () => 1,
    visibility: { target: runTarget, isHidden: () => false },
  });
  const tick = (): void => {
    flow.frame(1000 / 60);
    runMemory.render(scene);
  };

  let loop: ((timeMs: number) => void) | null = null;
  let previewTime = 0;
  const stub = {
    domElement: new FakeEl(),
    render: (s: THREE.Scene) => previewMemory.render(s),
    setSize: () => {},
    setAnimationLoop: (cb: ((timeMs: number) => void) | null) => {
      loop = cb;
    },
    dispose: () => {},
  } as unknown as PreviewCanvasRenderer;
  const preview = mountPlayPreview({
    doc: { createElement: () => new FakeEl() } as unknown as Document,
    cast,
    source: createPlayPreviewSession({ content: CONTENT, reducedMotion: () => false }),
    visibility: { target: previewTarget, isHidden: () => false },
    createRenderer: () => stub,
    textures: { labels: new THREE.Texture(), badges: new THREE.Texture() },
  });
  const previewFrames = (n: number): void => {
    for (let i = 0; i < n; i++) {
      previewTime += 100;
      (loop as ((timeMs: number) => void) | null)?.(previewTime);
    }
  };
  const mountPreview = () => preview.mount(new FakeEl() as unknown as HTMLElement);

  return {
    flow,
    tick,
    runMemory,
    previewMemory,
    runListeners,
    previewListeners,
    mountPreview,
    previewFrames,
  };
}

describe('play and mode switching', () => {
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
    warnSpy = vi.spyOn(console, 'warn');
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it(`leaves memory, listeners and the console clean after ${ROUNDS} rounds through every play in both modes`, () => {
    const s = setup();
    const plays = sortPlayList(CONTENT.plays);
    expect(plays).toHaveLength(5);

    s.tick();
    const runBaseline = { ...s.runMemory.info.memory };
    expect(runBaseline.geometries).toBeGreaterThan(0);
    const runListenerBaseline = s.runListeners();
    const previewListenerBaseline = s.previewListeners();
    expect(runListenerBaseline).toEqual({});
    expect(previewListenerBaseline).toEqual({});

    const first = s.mountPreview();
    first.show(plays[0]!.id);
    s.previewFrames(5);
    first.unmount();
    s.previewMemory.render(new THREE.Scene());
    const previewBaseline = { ...s.previewMemory.info.memory };
    expect(previewBaseline).toEqual({ geometries: 0, textures: 0 });

    const inRun = new Map<string, { geometries: number; textures: number }>();
    for (let round = 1; round <= ROUNDS; round++) {
      for (const mode of MODES) {
        s.flow.send({ type: mode });
        expect(s.flow.state().screen).toBe('playSelect');
        const handle = s.mountPreview();
        for (const play of plays) {
          handle.show(play.id);
          s.previewFrames(5);
        }
        for (const [i, play] of plays.entries()) {
          if (i === 0) handle.unmount();
          expect(s.flow.send({ type: 'selectPlay', playId: play.id }).ok).toBe(true);
          for (let t = 0; t < 10; t++) s.tick();
          const key = `${mode}:${play.id}`;
          const snapshot = { ...s.runMemory.info.memory };
          if (round === 1) inRun.set(key, snapshot);
          else expect(snapshot, `round ${round} ${key}`).toEqual(inRun.get(key));
          s.flow.send({ type: 'pause' });
          s.flow.send({ type: 'quit' });
          expect(s.flow.state().screen).toBe('playSelect');
        }
        s.tick();
        s.flow.send({ type: 'back' });
        expect(s.flow.state().screen).toBe('mainMenu');
        s.tick();
      }
      if (round === 1) expect(inRun.size).toBe(plays.length * MODES.length);
      s.previewMemory.render(new THREE.Scene());
      expect(s.runMemory.info.memory, `round ${round} run memory`).toEqual({
        ...runBaseline,
        textures: ATLAS_TEXTURES,
      });
      expect(s.previewMemory.info.memory, `round ${round} preview memory`).toEqual(previewBaseline);
      expect(s.runListeners(), `round ${round} run listeners`).toEqual(runListenerBaseline);
      expect(s.previewListeners(), `round ${round} preview listeners`).toEqual(
        previewListenerBaseline,
      );
      expect(errorSpy, `round ${round} console.error`).not.toHaveBeenCalled();
      expect(warnSpy, `round ${round} console.warn`).not.toHaveBeenCalled();
    }
  });
});
