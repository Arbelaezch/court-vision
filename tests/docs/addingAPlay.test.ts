import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PLAY_SOURCES,
  checkPhaseConcepts,
  loadCastContent,
  loadGlossary,
  loadScenarios,
} from '../../src/content';
import { ELBOW_DRIVE_DATA, ELBOW_DRIVE_FILE } from './fixtures/elbowDrive';

const doc = readFileSync(new URL('../../docs/adding-a-play.md', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const fixtureSource = readFileSync(
  new URL('./fixtures/elbowDrive.ts', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

function loadTable() {
  const roles = loadCastContent().roles;
  return loadScenarios(
    [...BUNDLED_PLAY_SOURCES, { file: ELBOW_DRIVE_FILE, data: ELBOW_DRIVE_DATA }],
    roles,
  );
}

describe('docs/adding-a-play.md worked example', () => {
  it('passes the real validators', () => {
    const table = loadTable();
    const play = table['elbowDrive'];
    expect(play).toBeDefined();
    expect(play?.kind).toBe('play');
    if (play?.kind === 'play') expect(play.practiceCoverage).toBe('soloDefense');
    expect(() => checkPhaseConcepts(table, loadGlossary())).not.toThrow();
  });

  it('uses route options and switch steps', () => {
    const play = loadTable()['elbowDrive'];
    if (play?.kind !== 'play') throw new Error('elbowDrive is not a play');
    const options = play.decisions.flatMap((d) => d.options);
    expect(options.some((o) => o.branch !== undefined)).toBe(true);
    const defenders = play.coverages.flatMap((c) =>
      c.script.flatMap((s) => Object.values(s.defenders)),
    );
    expect(defenders.some((d) => d.action === 'switch' && d.guards !== undefined)).toBe(true);
  });

  it('is shown verbatim in the doc', () => {
    expect(doc).toContain('```ts\n' + fixtureSource + '```');
  });

  it('covers each required topic', () => {
    for (const heading of [
      '## Play data format',
      '## Coverages',
      '## The Practice standard coverage',
      '## Cues',
      '## Shared behaviours',
      '## Bot tests',
      '## Adding a role',
    ]) {
      expect(doc).toContain(`\n${heading}\n`);
    }
  });

  it('names only repo paths that exist', () => {
    const paths = [...doc.matchAll(/`((?:src|tests|docs)\/[^`\s]+)`/g)]
      .map((m) => (m[1] as string).replace(/:\d+(-\d+)?$/, ''))
      .filter((p) => !p.includes('<') && p !== ELBOW_DRIVE_FILE);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      expect(existsSync(new URL('../../' + path, import.meta.url)), path).toBe(true);
    }
  });
});
