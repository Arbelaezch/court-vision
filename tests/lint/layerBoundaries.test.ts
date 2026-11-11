import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('layer boundaries (lint)', { timeout: 30_000 }, () => {
  let eslint: ESLint;

  beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot });
  });

  async function lint(rel: string, code: string) {
    const results = await eslint.lintText(code, { filePath: path.join(repoRoot, rel) });
    const result = results[0];
    if (!result) throw new Error('no lint result');
    return result.messages;
  }

  const threeImport = "import * as THREE from 'three'; export const x = THREE;";

  it('does not ignore virtual sim paths', async () => {
    const messages = await lint('src/sim/__lintFixture__.ts', 'export const a = 1;');
    expect(messages.filter((m) => /ignored/i.test(m.message))).toEqual([]);
  });

  it.each(['sim', 'content', 'ai'])('rejects importing three in src/%s', async (layer) => {
    const messages = await lint(`src/${layer}/__lintFixture__.ts`, threeImport);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit?.severity).toBe(2);
  });

  it('rejects three subpath imports in src/sim', async () => {
    const messages = await lint(
      'src/sim/__lintFixture__.ts',
      "import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; export const c = OrbitControls;",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  const layers = ['render', 'ui', 'input', 'audio', 'app'];
  const headless = ['sim', 'content', 'ai'];

  it.each(headless.flatMap((from) => layers.map((to) => [from, to] as const)))(
    'rejects importing the %s -> %s layer',
    async (from, to) => {
      const messages = await lint(
        `src/${from}/__lintFixture__.ts`,
        `import { x } from '../${to}/scene'; export const y = x;`,
      );
      expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
    },
  );

  it.each(layers)('rejects a bare ../%s import in src/sim', async (to) => {
    const messages = await lint(
      'src/sim/__lintFixture__.ts',
      `import { x } from '../${to}'; export const y = x;`,
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows same-layer relative imports named like a browser layer', async () => {
    const messages = await lint(
      'src/sim/__lintFixture__.ts',
      "import { a } from './input'; export const b = a;",
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });

  it.each([
    ['export-from', "export * from 'three';"],
    ['type import', "import type { Scene } from 'three'; export type S = Scene;"],
  ])('rejects three via %s in src/sim', async (_name, code) => {
    const messages = await lint('src/sim/__lintFixture__.ts', code);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it.each([
    ['three', "export const t = import('three');"],
    ['three subpath', "export const t = import('three/examples/jsm/controls/OrbitControls.js');"],
    ['browser layer', "export const t = import('../render/scene');"],
    ['non-literal', 'export const t = (n: string) => import(n);'],
  ])('rejects dynamic import of %s in src/sim', async (_name, code) => {
    const messages = await lint('src/sim/__lintFixture__.ts', code);
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('allows a literal same-layer dynamic import in src/sim', async () => {
    const messages = await lint(
      'src/sim/__lintFixture__.ts',
      "export const t = import('./input');",
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-syntax')).toEqual([]);
  });

  it('applies the headless rules to .js files in src/sim', async () => {
    const messages = await lint('src/sim/__lintFixture__.js', threeImport);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it.each([
    ['document', "export const el = document.createElement('div');"],
    ['window', 'export const w = window.innerWidth;'],
    ['addEventListener', "addEventListener('click', () => {});"],
    ['innerWidth', 'export const w = innerWidth;'],
    ['KeyboardEvent', 'export const k = new KeyboardEvent("keydown");'],
  ])('rejects the %s global in src/sim', async (_name, code) => {
    const messages = await lint('src/sim/__lintFixture__.ts', code);
    expect(messages.some((m) => m.ruleId === 'no-restricted-globals')).toBe(true);
  });

  it('allows three in src/render', async () => {
    const messages = await lint(
      'src/render/__lintFixture__.ts',
      "import * as THREE from 'three'; export const s = new THREE.Scene();",
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });

  it('allows DOM globals in src/ui', async () => {
    const messages = await lint('src/ui/__lintFixture__.ts', 'export const el = document.body;');
    expect(messages.filter((m) => m.ruleId === 'no-restricted-globals')).toEqual([]);
  });
});
