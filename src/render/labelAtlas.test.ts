import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadCastContent } from '../content';
import { collectCastLabels, createLabelAtlas, layoutLabelAtlas } from './labelAtlas';

describe('layoutLabelAtlas', () => {
  it('dedupes labels and places non-overlapping cells inside [0,1]', () => {
    const layout = layoutLabelAtlas(['1', '2', '1', '3', '4'], 2);
    expect(layout.cells.size).toBe(4);
    expect(layout.rows).toBe(2);
    const cells = [...layout.cells.values()];
    for (const c of cells) {
      expect(c.u0).toBeGreaterThanOrEqual(0);
      expect(c.u1).toBeLessThanOrEqual(1);
      expect(c.v0).toBeGreaterThanOrEqual(0);
      expect(c.v1).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]!;
        const b = cells[j]!;
        const overlap = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
        expect(overlap).toBe(false);
      }
    }
    expect(layout.cells.get('1')).toEqual({ u0: 0, u1: 0.5, v1: 1, v0: 0.5 });
  });

  it('throws on empty input', () => {
    expect(() => layoutLabelAtlas([])).toThrow(/at least one label/);
  });
});

describe('createLabelAtlas', () => {
  it('returns laid-out cells and throws on unknown labels (no canvas needed)', () => {
    const atlas = createLabelAtlas(['7', 'PG'], { texture: new THREE.Texture() });
    expect(atlas.cell('7')).toEqual(layoutLabelAtlas(['7', 'PG']).cells.get('7'));
    expect(() => atlas.cell('99')).toThrow(/not in the atlas/);
    expect(() => atlas.dispose()).not.toThrow();
  });

  it('accepts a wide cell width without changing the UV cells', () => {
    const atlas = createLabelAtlas(['1 SG'], { texture: new THREE.Texture(), cellWidthPx: 320 });
    expect(atlas.cell('1 SG')).toEqual(layoutLabelAtlas(['1 SG']).cells.get('1 SG'));
  });

  it.each([0, NaN])('throws for cellWidthPx %s', (cellWidthPx) => {
    expect(() => createLabelAtlas(['1 SG'], { texture: new THREE.Texture(), cellWidthPx })).toThrow(
      /^Court Vision:/,
    );
  });
});

describe('collectCastLabels', () => {
  it('has jersey numbers and role ids without duplicates', () => {
    const labels = collectCastLabels(loadCastContent().teams);
    for (const l of ['3', '50', '44', 'PG', 'C']) expect(labels).toContain(l);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
