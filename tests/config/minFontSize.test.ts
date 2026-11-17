// Every UI font size must be an absolute px value of at least 14. "1080p" means CSS px at a
// 1920x1080 viewport with DPR 1. Relative or viewport units and keywords are rejected so the
// floor stays absolute. Canvas atlas code (`ctx.font = ...`) has no colon and is excluded.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIN_PX = 14;
const srcDir = new URL('../../src/', import.meta.url);

function tsFiles(dir: URL): URL[] {
  const out: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsFiles(new URL(`${entry.name}/`, dir)));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(new URL(entry.name, dir));
    }
  }
  return out;
}

const sources: { name: string; text: string }[] = [
  { name: 'src/style.css', text: readFileSync(new URL('style.css', srcDir), 'utf8') },
  { name: 'index.html', text: readFileSync(new URL('../index.html', srcDir), 'utf8') },
  ...tsFiles(srcDir).map((u) => ({
    name: u.pathname.slice(u.pathname.indexOf('/src/') + 1),
    text: readFileSync(u, 'utf8'),
  })),
];

const DECL = /(?<![\w-])font(?:-size)?\s*:\s*([^;}"'`\n]*)/g;

const found: { where: string; value: string; decl: string }[] = [];
for (const { name, text } of sources) {
  for (const m of text.matchAll(DECL)) {
    found.push({ where: name, value: (m[1] ?? '').trim(), decl: m[0].trim() });
  }
}

describe('minimum UI font size', () => {
  it('finds at least 10 font declarations', () => {
    expect(found.length).toBeGreaterThanOrEqual(10);
  });

  it.each(found.map((f) => [f.where, f.decl, f.value] as const))(
    '%s: "%s" is an absolute px size >= 14',
    (_where, _decl, value) => {
      const sizes = [...value.matchAll(/(\d*\.?\d+)px\b/g)].map((m) => Number(m[1]));
      expect(sizes.length).toBeGreaterThan(0);
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(MIN_PX);
      expect(value).not.toMatch(/\d(em|rem|%|vw|vh|vmin|vmax)\b|\d%/);
    },
  );
});
