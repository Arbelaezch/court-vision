import { describe, expect, it } from 'vitest';
import { createStatsOverlay, parseStatsFlag } from './statsOverlay';

class FakeEl {
  className = '';
  textContent = '';
  parent: FakeEl | null = null;
  readonly children: FakeEl[] = [];
  readonly attrs: Record<string, string> = {};
  readonly style = { cssText: '' };
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

const INFO = { render: { calls: 42 }, memory: { geometries: 31, textures: 3 } };

function setup() {
  const container = new FakeEl();
  const doc = { createElement: () => new FakeEl() };
  const overlay = createStatsOverlay({
    container: container as unknown as HTMLElement,
    doc: doc as unknown as Document,
  });
  return { container, overlay };
}

describe('parseStatsFlag', () => {
  it('is off for absent, 0 and false and on otherwise', () => {
    expect(parseStatsFlag(null)).toBe(false);
    expect(parseStatsFlag('')).toBe(true);
    expect(parseStatsFlag('1')).toBe(true);
    expect(parseStatsFlag('0')).toBe(false);
    expect(parseStatsFlag('false')).toBe(false);
  });
});

describe('createStatsOverlay', () => {
  it('appends one aria-hidden element to the container', () => {
    const { container } = setup();
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.attrs['aria-hidden']).toBe('true');
    expect(container.children[0]?.style.cssText).toContain('pointer-events: none');
  });

  it('shows FPS - before the first refresh', () => {
    const { container, overlay } = setup();
    overlay.update(0, INFO);
    overlay.update(33, INFO);
    expect(container.children[0]?.textContent).toBe(
      'FPS - | draw calls 42 | geometries 31 | textures 3',
    );
  });

  it('reports about 30 FPS for frames fed at 30 Hz', () => {
    const { container, overlay } = setup();
    for (let i = 0; i <= 30; i++) overlay.update((i * 1000) / 30, INFO);
    expect(container.children[0]?.textContent).toMatch(
      /^FPS (29|30|31) \| draw calls 42 \| geometries 31 \| textures 3$/,
    );
  });

  it('removes the element on dispose, ignores later updates and disposes twice safely', () => {
    const { container, overlay } = setup();
    const el = container.children[0];
    overlay.update(0, INFO);
    const text = el?.textContent;
    overlay.dispose();
    expect(container.children).toHaveLength(0);
    expect(() => overlay.update(100, { ...INFO, render: { calls: 7 } })).not.toThrow();
    expect(el?.textContent).toBe(text);
    expect(() => overlay.dispose()).not.toThrow();
  });
});
