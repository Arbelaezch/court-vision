import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('court constants module', { timeout: 30_000 }, () => {
  it('src/sim/court.ts does not import three', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/sim/court.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]three/);
    expect(source).not.toMatch(/import\(\s*['"]three/);
  });

  it('src/sim/court.ts lints clean', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const results = await eslint.lintFiles(['src/sim/court.ts']);
    const errors = results.reduce((n, r) => n + r.errorCount, 0);
    expect(errors).toBe(0);
  });

  it('src/render defines no shared court dimension constants', () => {
    const dir = path.join(repoRoot, 'src/render');
    const files = fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/export const (HALF_COURT_WIDTH|HALF_COURT_DEPTH|RIM_HEIGHT)\b/);
      expect(source, file).not.toMatch(/const (HALF_COURT_WIDTH|HALF_COURT_DEPTH|RIM_HEIGHT)\s*=/);
    }
  });
});
