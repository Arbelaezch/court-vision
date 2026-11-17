import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlayPreviewSession, loadAppContent, sortPlayList } from '../app';
import { loadCastContent } from '../content';
import { FakeMemoryRenderer } from './fakeMemoryRenderer';
import { createPlayPreviewView } from './playPreview';

const CONTENT = loadAppContent();
const cast = loadCastContent();

function setup(): {
  renderer: FakeMemoryRenderer;
  view: ReturnType<typeof createPlayPreviewView>;
  session: ReturnType<typeof createPlayPreviewSession>;
  run: (playId: string, frames: number) => void;
} {
  const renderer = new FakeMemoryRenderer();
  const view = createPlayPreviewView({
    cast,
    target: renderer,
    textures: { labels: new THREE.Texture(), badges: new THREE.Texture() },
  });
  const session = createPlayPreviewSession({ content: CONTENT, reducedMotion: () => false });
  const run = (playId: string, frames: number): void => {
    session.select(playId);
    for (let i = 0; i < frames; i++) {
      const f = session.frame(100);
      if (f) view.draw(f);
    }
  };
  return { renderer, view, session, run };
}

describe('play preview view', () => {
  it('returns GPU memory to baseline after looping every play 20 times', () => {
    const { renderer, run } = setup();
    const first = sortPlayList(CONTENT.plays)[0]!.id;
    run(first, 5);
    const baseline = { ...renderer.info.memory };
    expect(baseline.geometries).toBeGreaterThan(0);
    expect(baseline.textures).toBeGreaterThan(0);

    for (let round = 0; round < 20; round++) {
      for (const id of Object.keys(CONTENT.plays)) run(id, 5);
    }
    run(first, 5);
    expect(renderer.info.memory).toEqual(baseline);
  });

  it('releases everything when the view is disposed', () => {
    const { renderer, view, run } = setup();
    run(sortPlayList(CONTENT.plays)[0]!.id, 5);
    view.dispose();
    renderer.render(new THREE.Scene());
    expect(renderer.info.memory).toEqual({ geometries: 0, textures: 0 });
    view.dispose();
  });

  it('throws when drawing after dispose', () => {
    const { view, session } = setup();
    session.select(sortPlayList(CONTENT.plays)[0]!.id);
    const f = session.frame(100)!;
    view.dispose();
    expect(() => view.draw(f)).toThrow(/disposed/);
  });
});
