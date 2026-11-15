import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlayPreviewSession, loadAppContent, sortPlayList } from '../app';
import type { PreviewDrawFrame } from '../app';
import { loadCastContent } from '../content';
import { mountPlayPreview } from './mountPlayPreview';
import type { PreviewCanvasRenderer } from './mountPlayPreview';

const CONTENT = loadAppContent();
const cast = loadCastContent();

class FakeEl {
  className = '';
  textContent = '';
  parent: FakeEl | null = null;
  readonly children: FakeEl[] = [];
  readonly attrs: Record<string, string> = {};
  appendChild(child: FakeEl): FakeEl {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

function setup() {
  const canvas = new FakeEl();
  const loops: Array<((t: number) => void) | null> = [];
  let created = 0;
  let renders = 0;
  let renderDisposed = 0;
  const renderer = {
    domElement: canvas,
    render: () => {
      renders++;
    },
    setSize: () => {},
    setAnimationLoop: (cb: ((t: number) => void) | null) => {
      loops.push(cb);
    },
    dispose: () => {
      renderDisposed++;
    },
  } as unknown as PreviewCanvasRenderer;

  const session = createPlayPreviewSession({ content: CONTENT, reducedMotion: () => false });
  const calls = { select: [] as string[], frame: 0, stop: 0 };
  const source = {
    select(id: string) {
      calls.select.push(id);
      session.select(id);
    },
    frame(dt: number): PreviewDrawFrame | null {
      calls.frame++;
      return session.frame(dt);
    },
    stop() {
      calls.stop++;
      session.stop();
    },
  };
  const visibility = new EventTarget();
  let hidden = false;
  const doc = { createElement: () => new FakeEl() } as unknown as Document;
  const mount = mountPlayPreview({
    doc,
    cast,
    source,
    visibility: { target: visibility, isHidden: () => hidden },
    createRenderer: () => {
      created++;
      return renderer;
    },
    textures: { labels: new THREE.Texture(), badges: new THREE.Texture() },
  });
  return {
    mount,
    loops,
    calls,
    canvas,
    visibility,
    setHidden: (h: boolean) => {
      hidden = h;
    },
    stats: () => ({ created, renders, renderDisposed }),
  };
}

const el = (): FakeEl => new FakeEl();
const asParent = (e: FakeEl): HTMLElement => e as unknown as HTMLElement;

describe('mountPlayPreview', () => {
  it('keeps a single viewport when mounted twice', () => {
    const s = setup();
    const a = el();
    const b = el();
    const first = s.mount.mount(asParent(a));
    expect(a.children).toHaveLength(2);
    expect(s.canvas.attrs['aria-hidden']).toBe('true');
    expect(a.children[1]!.attrs['aria-live']).toBeUndefined();
    s.mount.mount(asParent(b));
    expect(a.children).toHaveLength(0);
    expect(b.children.filter((c) => c === s.canvas)).toHaveLength(1);
    expect(s.loops).toContain(null);
    expect(s.calls.stop).toBe(1);
    expect(s.stats().created).toBe(1);
    first.show('x');
    expect(s.calls.select).toEqual([]);
  });

  it('draws frames and sets the coverage label', () => {
    const s = setup();
    const parent = el();
    const handle = s.mount.mount(asParent(parent));
    handle.show(sortPlayList(CONTENT.plays)[0]!.id);
    const loop = s.loops[s.loops.length - 1]!;
    loop(0);
    loop(100);
    expect(s.calls.frame).toBe(2);
    expect(s.stats().renders).toBe(2);
    expect(parent.children[1]!.textContent).not.toBe('');
  });

  it('unmount removes the nodes and is idempotent', () => {
    const s = setup();
    const parent = el();
    const handle = s.mount.mount(asParent(parent));
    handle.unmount();
    handle.unmount();
    expect(parent.children).toHaveLength(0);
    expect(s.calls.stop).toBe(1);
    handle.show('anything');
    expect(s.calls.select).toEqual([]);
    s.mount.dispose();
    expect(s.stats().renderDisposed).toBe(1);
  });

  it('pauses the loop while hidden', () => {
    const s = setup();
    s.mount.mount(asParent(el()));
    s.setHidden(true);
    s.visibility.dispatchEvent(new Event('visibilitychange'));
    expect(s.loops[s.loops.length - 1]).toBeNull();
  });
});
