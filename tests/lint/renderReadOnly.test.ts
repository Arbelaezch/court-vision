import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('render is read-only (lint)', { timeout: 60_000 }, () => {
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

  const fixture = 'src/render/__lintFixture__.ts';

  it.each(['stepGame', 'takeShot'])('rejects importing %s from ../sim', async (name) => {
    const messages = await lint(fixture, `import { ${name} } from '../sim'; export const x = ${name};`);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit?.severity).toBe(2);
  });

  it('rejects deep imports of stepping modules', async () => {
    const messages = await lint(
      fixture,
      "import { startPass } from '../sim/passing'; export const x = startPass;",
    );
    expect(messages.find((m) => m.ruleId === 'no-restricted-imports')?.severity).toBe(2);
  });

  it('allows read-only helpers from the ../sim barrel', async () => {
    const messages = await lint(
      fixture,
      "import { passHeightAt, stepperAlpha, recordHeadless } from '../sim'; export const x = [passHeightAt, stepperAlpha, recordHeadless];",
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });

  it('allows stepGame in render test files', async () => {
    const messages = await lint(
      'src/render/__lintFixture__.test.ts',
      "import { stepGame } from '../sim'; export const x = stepGame;",
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });

  it('reports no errors on the real tree', async () => {
    const results = await eslint.lintFiles(['src', 'tests']);
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2));
    expect(errors).toEqual([]);
  });
});
