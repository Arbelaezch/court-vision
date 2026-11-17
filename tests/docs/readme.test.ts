import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('README', () => {
  it('names only npm scripts that exist', () => {
    const names = [...readme.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(pkg.scripts, name).toHaveProperty(name);
    }
  });

  it('links only to files that exist', () => {
    const targets = [...readme.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1] as string)
      .filter((t) => !/^[a-z]+:/i.test(t) && !t.startsWith('#'))
      .map((t) => t.replace(/#.*$/, ''));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(existsSync(new URL('../../' + target, import.meta.url)), target).toBe(true);
    }
  });

  it('has the live and dev URLs', () => {
    expect(readme).toContain('https://arbelaezch.github.io/court-vision/');
    expect(readme).toContain('localhost:5173/court-vision/');
  });

  it('has fresh-clone steps', () => {
    expect(readme).toMatch(/npm ci|npm install/);
    expect(readme).toContain('git clone');
    expect(readme).toContain('npm run dev');
    expect(readme).toContain('npm run test');
    expect(readme).toContain('npm run build');
  });

  it('has no leftover placeholder notes', () => {
    expect(readme).not.toContain('written during M10');
    expect(readme).not.toContain('created when needed');
  });
});
