import { describe, expect, it } from 'vitest';
import { createCuePromptOverlay } from './cuePrompt';

class FakeEl {
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  className = '';
  removed = false;
  textWrites = 0;
  private text = '';
  style: { cssText: string; display: string; background: string; padding: string } = {
    cssText: '',
    display: '',
    background: '',
    padding: '',
  };
  get textContent(): string {
    return this.text;
  }
  set textContent(v: string) {
    this.textWrites++;
    this.text = v;
  }
  appendChild(c: FakeEl): FakeEl {
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  remove(): void {
    this.removed = true;
  }
}

function setup() {
  const container = new FakeEl();
  const doc = { createElement: () => new FakeEl() };
  const overlay = createCuePromptOverlay({
    container: container as unknown as HTMLElement,
    doc: doc as unknown as Document,
  });
  const root = container.children[0]!;
  const [headline, reason] = root.children as [FakeEl, FakeEl];
  return { overlay, root, headline, reason };
}

describe('createCuePromptOverlay', () => {
  it('appends an empty status root that stays in the accessibility tree', () => {
    const { root } = setup();
    expect(root.attrs['role']).toBe('status');
    expect(root.style.display).not.toBe('none');
    expect(root.style.background).toBe('transparent');
  });

  it('shows headline and reason', () => {
    const { overlay, root, headline, reason } = setup();
    overlay.show({ headline: 'Pass to the wing (1 SG)', reason: 'x' });
    expect(root.style.display).not.toBe('none');
    expect(root.style.background).not.toBe('transparent');
    expect(headline.textContent).toBe('Pass to the wing (1 SG)');
    expect(reason.textContent).toBe('x');
    expect(reason.style.display).not.toBe('none');
  });

  it('hides the reason when null', () => {
    const { overlay, reason } = setup();
    overlay.show({ headline: 'Cut to the rim!', reason: null });
    expect(reason.style.display).toBe('none');
  });

  it('hides on null', () => {
    const { overlay, root, headline, reason } = setup();
    overlay.show({ headline: 'a', reason: null });
    overlay.show(null);
    expect(root.style.display).not.toBe('none');
    expect(root.style.background).toBe('transparent');
    expect(headline.textContent).toBe('');
    expect(reason.textContent).toBe('');
  });

  it('does not rewrite text for the same prompt', () => {
    const { overlay, headline, reason } = setup();
    overlay.show({ headline: 'a', reason: 'b' });
    const writes = [headline.textWrites, reason.textWrites];
    overlay.show({ headline: 'a', reason: 'b' });
    expect([headline.textWrites, reason.textWrites]).toEqual(writes);
  });

  it('removes the root on dispose', () => {
    const { overlay, root } = setup();
    overlay.dispose();
    expect(root.removed).toBe(true);
  });
});
