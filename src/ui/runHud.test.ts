import { describe, expect, it } from 'vitest';
import type { RunHudModel } from '../app';
import { createRunHud } from './runHud';

class FakeEl {
  tagName: string;
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  className = '';
  textContent = '';
  hidden = false;
  style: Record<string, string> = {};
  removed = false;
  constructor(tag = 'div') {
    this.tagName = tag;
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
  const doc = { createElement: (tag: string) => new FakeEl(tag) };
  const hud = createRunHud({
    container: container as unknown as HTMLElement,
    doc: doc as unknown as Document,
  });
  const root = container.children[0]!;
  const [objective, meter, banner] = root.children as [FakeEl, FakeEl, FakeEl];
  return { hud, root, objective, meter, fill: meter.children[0]!, banner };
}

const model = (over: Partial<RunHudModel> = {}): RunHudModel => ({
  objective: 'Give and go',
  stamina: 1,
  banner: null,
  ...over,
});

describe('run HUD', () => {
  it('renders the objective', () => {
    const { hud, root, objective } = setup();
    expect(root.hidden).toBe(true);
    hud.update(model());
    expect(root.hidden).toBe(false);
    expect(objective.textContent).toBe('Give and go');
  });

  it('follows stamina in aria and fill width', () => {
    const { hud, meter, fill } = setup();
    expect(meter.attrs['role']).toBe('meter');
    expect(meter.attrs['aria-label']).toBe('Stamina');
    hud.update(model({ stamina: 1 }));
    expect(meter.attrs['aria-valuenow']).toBe('1');
    expect(fill.style['width']).toBe('100%');
    hud.update(model({ stamina: 0.4 }));
    expect(meter.attrs['aria-valuenow']).toBe('0.4');
    expect(fill.style['width']).toBe('40%');
  });

  it('shows and hides the banner', () => {
    const { hud, banner } = setup();
    expect(banner.attrs['role']).toBe('status');
    hud.update(model({ banner: { tone: 'success', text: 'Perfect run!' } }));
    expect(banner.hidden).toBe(false);
    expect(banner.className).toContain('cv-result-success');
    expect(banner.textContent).toBe('Perfect run!');
    hud.update(model({ banner: { tone: 'neutral', text: 'Not quite. Try again.' } }));
    expect(banner.className).toContain('cv-result-neutral');
    hud.update(model());
    expect(banner.hidden).toBe(true);
  });

  it('does not replace nodes on a repeated identical update', () => {
    const { hud, root } = setup();
    hud.update(model());
    const before = [...root.children];
    hud.update(model());
    expect(root.children).toHaveLength(before.length);
    root.children.forEach((c, i) => {
      expect(c).toBe(before[i]);
    });
  });

  it('hides everything on null', () => {
    const { hud, root } = setup();
    hud.update(model());
    hud.update(null);
    expect(root.hidden).toBe(true);
  });
});
