import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const uiDir = new URL('../../src/ui/', import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = readdirSync(uiDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const FORBIDDEN: readonly RegExp[] = [
  /\b(transition|animation)\s*:/,
  /@keyframes/,
  /requestAnimationFrame\s*\(/,
  /\.animate\s*\(/,
];

describe('UI code has no animation', () => {
  it('finds the ui source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has no animation or transition code', (file) => {
    const src = stripComments(readFileSync(new URL(file, uiDir), 'utf8'));
    for (const re of FORBIDDEN) expect(src).not.toMatch(re);
  });
});
