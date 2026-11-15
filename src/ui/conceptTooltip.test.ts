import { describe, expect, it } from 'vitest';
import type { GlossaryEntry } from '../content';
import { createConceptTooltipOverlay } from './conceptTooltip';

class FakeEl {
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  className = '';
  removed = false;
  textContent = '';
  style: { cssText: string } = { cssText: '' };
  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }
  appendChild(c: FakeEl): FakeEl {
    this.children.push(c);
    return c;
  }
  removeChild(c: FakeEl): FakeEl {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  remove(): void {
    this.removed = true;
  }
}

const ENTRY: GlossaryEntry = { id: 'cut', term: 'Cut', text: 'A sudden run toward the basket.' };

function setup() {
  const container = new FakeEl();
  const doc = { createElement: () => new FakeEl() };
  const overlay = createConceptTooltipOverlay({
    container: container as unknown as HTMLElement,
    doc: doc as unknown as Document,
  });
  return { overlay, root: container.children[0]! };
}

describe('createConceptTooltipOverlay', () => {
  it('is a polite status region that ignores the pointer and has no animation', () => {
    const { root } = setup();
    expect(root.attrs['role']).toBe('status');
    expect(root.attrs['aria-live']).toBe('polite');
    expect(root.style.cssText).toContain('pointer-events: none');
    expect(root.style.cssText).not.toMatch(/transition|animation/);
    expect(root.children).toHaveLength(0);
  });

  it('renders the term and text', () => {
    const { overlay, root } = setup();
    overlay.show([ENTRY]);
    const box = root.children[0]!;
    expect(box.style.cssText).not.toMatch(/transition|animation/);
    expect(box.children[0]!.textContent).toBe('New: Cut');
    expect(box.children[1]!.textContent).toBe(ENTRY.text);
  });

  it('does not rebuild for the same ids and empties on []', () => {
    const { overlay, root } = setup();
    overlay.show([ENTRY]);
    const first = root.children[0];
    overlay.show([ENTRY]);
    expect(root.children[0]).toBe(first);
    overlay.show([]);
    expect(root.children).toHaveLength(0);
  });

  it('removes the root on dispose', () => {
    const { overlay, root } = setup();
    overlay.dispose();
    expect(root.removed).toBe(true);
  });
});
