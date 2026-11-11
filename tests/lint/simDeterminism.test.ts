import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const isDeterminismError = (m: Linter.LintMessage) =>
  m.severity === 2 && m.message.includes('must be deterministic');

describe('sim determinism (lint)', { timeout: 30_000 }, () => {
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

  it.each([
    ['Math.random', 'export const r = Math.random();'],
    ['Date.now', 'export const t = Date.now();'],
    ['performance.now', 'export const t = performance.now();'],
    ['setTimeout', 'setTimeout(() => {}, 0);'],
    ['setInterval', 'setInterval(() => {}, 10);'],
    ['new Date()', 'export const d = new Date();'],
    ['Date()', 'export const d = Date();'],
    ['crypto.randomUUID', 'export const u = crypto.randomUUID();'],
    ['crypto.getRandomValues', 'crypto.getRandomValues(new Uint32Array(1));'],
  ])('rejects %s in src/sim', async (_name, code) => {
    const messages = await lint('src/sim/__lintFixture__.ts', code);
    expect(messages.some(isDeterminismError)).toBe(true);
  });

  it.each(['content', 'ai'])('rejects Math.random() in src/%s', async (layer) => {
    const messages = await lint(
      `src/${layer}/__lintFixture__.ts`,
      'export const r = Math.random();',
    );
    expect(messages.some(isDeterminismError)).toBe(true);
  });

  it.each([
    ['Math.imul/Math.floor', 'export const n = Math.imul(3, 5) + Math.floor(1.5);'],
    ['structuredClone', 'export const c = structuredClone({ a: 1 });'],
  ])('allows %s in src/sim', async (_name, code) => {
    const messages = await lint('src/sim/__lintFixture__.ts', code);
    expect(messages.filter(isDeterminismError)).toEqual([]);
  });

  it('allows Math.random() and performance.now() in src/render', async () => {
    const messages = await lint(
      'src/render/__lintFixture__.ts',
      'export const r = Math.random() + performance.now();',
    );
    expect(messages.filter(isDeterminismError)).toEqual([]);
  });
});
