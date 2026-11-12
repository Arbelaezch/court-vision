import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

function jobBlock(name: string): string {
  const pattern = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`, 'm');
  return pattern.exec(workflow)?.[1] ?? '';
}

const pushOnMain = "if: github.event_name == 'push' && github.ref == 'refs/heads/main'";

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

  it.each(['typecheck', 'lint', 'test', 'build', 'deploy'])('finds the %s job block', (name) => {
    expect(jobBlock(name)).not.toBe('');
  });

  it('gates upload and deploy to pushes on main after all checks', () => {
    const deploy = jobBlock('deploy');
    expect(deploy).toContain('needs: [typecheck, lint, test, build]');
    expect(deploy).toContain(pushOnMain);
    for (const text of [
      'actions/deploy-pages@',
      'pages: write',
      'id-token: write',
      'name: github-pages',
    ]) {
      expect(deploy).toContain(text);
    }
    const build = jobBlock('build');
    expect(build).toContain('actions/upload-pages-artifact@');
    expect(build).toContain(pushOnMain);
    expect(workflow.match(/refs\/heads\/main/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('keeps Vite base the only host-specific setting', () => {
    expect(workflow).not.toContain('court-vision');
    expect(workflow).not.toContain('actions/configure-pages');
  });

  it('documents the one-time Pages setup in the README', () => {
    for (const word of ['Settings', 'Pages', 'Source', 'GitHub Actions']) {
      expect(deploymentSection).toContain(word);
    }
    expect(deploymentSection).toMatch(/re-run/i);
    expect(deploymentSection).toContain('deploy');
  });
});
