import * as THREE from 'three';
import { ROLE_ORDER } from '../sim';
import type { TeamCast } from '../content';

const DEFAULT_COLUMNS = 8;
const CELL_PX = 128;

export interface LabelCell {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface LabelAtlasLayout {
  columns: number;
  rows: number;
  cells: ReadonlyMap<string, LabelCell>;
}

// Pure grid layout (v up, row 0 at the top). Duplicate labels share one cell.
export function layoutLabelAtlas(
  labels: readonly string[],
  columns = DEFAULT_COLUMNS,
): LabelAtlasLayout {
  const unique = [...new Set(labels)];
  if (unique.length === 0) throw new Error('Court Vision: label atlas needs at least one label');
  const rows = Math.ceil(unique.length / columns);
  const cells = new Map<string, LabelCell>();
  unique.forEach((label, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    cells.set(label, {
      u0: col / columns,
      u1: (col + 1) / columns,
      v1: 1 - row / rows,
      v0: 1 - (row + 1) / rows,
    });
  });
  return { columns, rows, cells };
}

export interface LabelAtlas {
  texture: THREE.Texture;
  cell(label: string): LabelCell;
  dispose(): void;
}

function drawAtlasCanvas(layout: LabelAtlasLayout): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = layout.columns * CELL_PX;
  canvas.height = layout.rows * CELL_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Court Vision: 2D canvas is unavailable for the label atlas');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 88px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, cell] of layout.cells) {
    const cx = ((cell.u0 + cell.u1) / 2) * canvas.width;
    const cy = (1 - (cell.v0 + cell.v1) / 2) * canvas.height;
    ctx.fillText(label, cx, cy);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// One shared texture of white text; materials tint it per team. Pass opts.texture in tests
// (no canvas in node).
export function createLabelAtlas(
  labels: readonly string[],
  opts: { texture?: THREE.Texture } = {},
): LabelAtlas {
  const layout = layoutLabelAtlas(labels);
  const texture = opts.texture ?? drawAtlasCanvas(layout);
  return {
    texture,
    cell(label) {
      const cell = layout.cells.get(label);
      if (!cell) throw new Error(`Court Vision: label "${label}" is not in the atlas`);
      return cell;
    },
    dispose() {
      texture.dispose();
    },
  };
}

// Jersey numbers of both teams plus the role ids (cone labels), deduped.
export function collectCastLabels(teams: TeamCast): string[] {
  const labels: string[] = [];
  for (const side of ['offense', 'defense'] as const) {
    for (const role of ROLE_ORDER) labels.push(String(teams[side].jerseyNumbers[role]));
  }
  for (const role of ROLE_ORDER) labels.push(role);
  return [...new Set(labels)];
}
