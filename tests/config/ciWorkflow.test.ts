import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

const deploymentSection = /^## Deployment\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme)?.[1] ?? '';

describe('CI workflow', () => {
  it('runs on pull requests and pushes scoped to main', () => {
    expect(workflow).toMatch(/pull_request:\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it.each(['npm ci', 'npm run typecheck', 'npm run lint', 'npm run test', 'npm run build'])(
    'runs %s',
    (cmd) => {
      expect(workflow).toContain(cmd);
    },
  );

  it('reads the Node version from .nvmrc', () => {
    expect(workflow).toContain('node-version-file: .nvmrc');
  });

  it.each([
    'actions/upload-pages-artifact@',
    'actions/deploy-pages@',
    'path: dist',
    'pages: write',
    'id-token: write',
    'name: github-pages',
  ])('contains %s', (text) => {
    expect(workflow).toContain(text);
  });

  it('gates upload and deploy to pushes on main', () => {
    expect(workflow).toContain('refs/heads/main');
  });

  it('keeps Vite base the only host-specific setting', () => {
    expect(workflow).not.toContain('court-vision');
    expect(workflow).not.toContain('actions/configure-pages');
  });

  it('documents the one-time Pages setup in the README', () => {
    for (const word of ['Settings', 'Pages', 'Source', 'GitHub Actions']) {
      expect(deploymentSection).toContain(word);
    }
  });
});
