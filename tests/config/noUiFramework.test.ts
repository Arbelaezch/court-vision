import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8')) as PackageJson;
const FRAMEWORKS = [
  'react',
  'react-dom',
  'preact',
  'vue',
  'svelte',
  'solid-js',
  'lit',
  '@angular/core',
  'mithril',
  'htm',
];

describe('no UI framework', () => {
  it.each(FRAMEWORKS)('does not depend on %s', (name) => {
    expect(pkg.dependencies ?? {}).not.toHaveProperty(name);
    expect(pkg.devDependencies ?? {}).not.toHaveProperty(name);
  });

  it('menus.ts imports only from ../app', () => {
    const src = readFileSync(new URL('src/ui/menus.ts', repoRoot), 'utf8');
    const sources = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(sources).toEqual(['../app']);
  });
});
