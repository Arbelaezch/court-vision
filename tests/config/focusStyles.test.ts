// Every keyboard-focusable UI element must show a visible focus ring.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');

function ruleFor(selector: string): string | undefined {
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selectors = (m[1] ?? '').split(',').map((s) => s.trim());
    if (selectors.includes(selector)) return m[2];
  }
  return undefined;
}

describe('focus styles', () => {
  it.each([
    '.cv-menu-button:focus-visible',
    '.cv-play-button:focus-visible',
    '.cv-glossary-list:focus-visible',
    '.cv-bind-slot:focus-visible',
  ])('%s draws a 3px outline', (selector) => {
    const body = ruleFor(selector);
    expect(body).toBeDefined();
    expect(body).toMatch(/outline:\s*3px solid #ffd54a/);
    expect(body).toMatch(/outline-offset:\s*2px/);
  });
});
