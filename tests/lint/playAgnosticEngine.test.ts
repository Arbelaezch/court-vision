import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCastContent, loadPlaybook } from '../../src/content';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const SCAN_DIRS = ['src/sim', 'src/ai', 'src/content', 'src/render', 'src/app'];
const SKIP_FILES = new Set(['src/content/playbook.ts', 'src/ai/testPlays.ts']);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const upperSnake = (id: string): string => id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const PLAYS = Object.values(loadPlaybook(loadCastContent().roles));

const FORBIDDEN_IDS = PLAYS.flatMap((play) => [
  play.id,
  upperSnake(play.id),
  ...play.coverages.map((c) => c.id),
  ...play.decisions.map((d) => d.id),
]);
const FORBIDDEN = [
  ...FORBIDDEN_IDS.map((id) => ({ label: id, re: new RegExp(`\\b${escapeRe(id)}\\b`) })),
  ...PLAYS.map((play) => ({
    label: play.name,
    re: new RegExp(
      play.name
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(escapeRe)
        .join('[-_ ]?'),
      'i',
    ),
  })),
];

function stripComments(code: string): string {
  // Keep newlines so line numbers survive.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

function findHits(code: string): string[] {
  const hits: string[] = [];
  stripComments(code)
    .split('\n')
    .forEach((line, i) => {
      for (const f of FORBIDDEN) if (f.re.test(line)) hits.push(`${i + 1}: ${f.label}`);
    });
  return hits;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (rel === 'src/content/data') continue;
      out.push(...listFiles(rel));
    } else if (rel.endsWith('.ts') && !rel.endsWith('.test.ts') && !SKIP_FILES.has(rel)) {
      out.push(rel);
    }
  }
  return out;
}

describe('play-agnostic engine', () => {
  const files = SCAN_DIRS.flatMap(listFiles);

  it('scans the engine files', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toEqual(
      expect.arrayContaining(['src/ai/referee.ts', 'src/ai/playRun.ts', 'src/render/devView.ts']),
    );
  });

  it('names no specific play, coverage or decision in code', () => {
    const hits = files.flatMap((f) =>
      findHits(fs.readFileSync(path.join(repoRoot, f), 'utf8')).map((h) => `${f}:${h}`),
    );
    expect(hits).toEqual([]);
  });

  it('matcher flags code and ignores comments', () => {
    expect(findHits('const p = book.giveAndGo;')).not.toEqual([]);
    expect(findHits("if (c === 'helpOnCut') {}")).not.toEqual([]);
    expect(findHits('// e.g. giveAndGo.tracks.SF\nconst x = 1;')).toEqual([]);
  });

  it('forbids the ids of every bundled play', () => {
    const labels = FORBIDDEN.map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'giveAndGo',
        'helpOnCut',
        'finishRead',
        'GIVE_AND_GO',
        'dribbleHandoff',
        'DRIBBLE_HANDOFF',
        'overTheTop',
        'underTheScreen',
        'switchOnHandoff',
        'handoffRead',
        'highPickAndRoll',
        'HIGH_PICK_AND_ROLL',
        'dropBig',
        'hedgeRecover',
        'switchOnScreen',
        'cornerHelp',
        'pickRead',
      ]),
    );
  });

  it('matcher flags a coverage id but not a generic switch', () => {
    expect(findHits("if (c === 'switchOnHandoff') {}")).not.toEqual([]);
    expect(findHits('switch (x) {}')).toEqual([]);
  });
});
