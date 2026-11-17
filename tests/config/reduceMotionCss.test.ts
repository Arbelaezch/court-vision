import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);
const css = readFileSync(new URL('src/style.css', repoRoot), 'utf8');

describe('result banner reduce-motion CSS', () => {
  it('defines the entrance keyframes', () => {
    expect(css).toMatch(/@keyframes\s+cv-result-banner-in\b/);
  });

  it('animates the banner by default', () => {
    expect(css).toMatch(/\.cv-result-banner\s*\{[^}]*animation:\s*cv-result-banner-in/);
  });

  it('turns the animation off under .cv-reduce-motion', () => {
    expect(css).toMatch(
      /\.cv-reduce-motion\s+\.cv-result-banner\s*\{[^}]*animation:\s*none\s*;?[^}]*\}/,
    );
  });

  it('turns off every animation and transition under .cv-reduce-motion *', () => {
    const m = css.match(/\.cv-reduce-motion\s+\*\s*,[^{]*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/animation:\s*none/);
    expect(m![1]).toMatch(/transition:\s*none/);
  });

  it('turns the animation off under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*\.cv-result-banner\s*\{[^}]*animation:\s*none/,
    );
  });
});
