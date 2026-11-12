import { describe, expect, it } from 'vitest';
import { loadCastContent } from './cast';
import { BUNDLED_PLAY_SOURCES, loadPlaybook } from './playbook';
import { loadScenario } from './scenarios';

const roles = loadCastContent().roles;

describe('bundled playbook', () => {
  it('loads and contains giveAndGo', () => {
    const playbook = loadPlaybook(roles);
    expect(Object.keys(playbook).length).toBeGreaterThanOrEqual(1);
    expect(playbook).toHaveProperty('giveAndGo');
  });

  it.each(BUNDLED_PLAY_SOURCES.map((s) => [s.file, s] as const))('loads %s', (_file, source) => {
    const scenario = loadScenario(source, roles);
    const basename = source.file.split('/').pop()?.replace(/\.ts$/, '');
    expect(scenario.id).toBe(basename);
    expect(source.file).toBe(`src/content/data/plays/${scenario.id}.ts`);
  });

  it('registers every play file', () => {
    const found = Object.keys(import.meta.glob('./data/plays/*.ts'))
      .map((p) => p.replace('./data/plays/', 'src/content/data/plays/'))
      .sort();
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found).toEqual(BUNDLED_PLAY_SOURCES.map((s) => s.file).sort());
  });
});
