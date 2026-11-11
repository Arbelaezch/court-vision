import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config';

const repoRoot = new URL('../../', import.meta.url);
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const LAYERS = ['sim', 'content', 'ai', 'input', 'render', 'ui', 'audio', 'app'];

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8')) as PackageJson;

describe('project config', () => {
  it('serves under the GitHub Pages base path', () => {
    expect(viteConfig.base).toBe('/court-vision/');
  });

  it('pins three and @types/three to exact versions', () => {
    expect(pkg.dependencies['three']).toMatch(EXACT_VERSION);
    expect(pkg.devDependencies['@types/three']).toMatch(EXACT_VERSION);
  });

  it.each(['dev', 'build', 'preview', 'test', 'typecheck', 'lint', 'format', 'format:check'])(
    'defines the %s script',
    (name) => {
      expect(pkg.scripts[name]).toBeTruthy();
    },
  );

  it.each(LAYERS)('has src/%s/index.ts', (layer) => {
    expect(existsSync(new URL(`src/${layer}/index.ts`, repoRoot))).toBe(true);
  });
});
