/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '../sim';
import { TEAMS_DATA, TEAMS_FILE } from './data/teams';
import { loadTeams } from './teams';
import { ContentValidationError } from './validate';

function load(data: unknown) {
  return loadTeams({ file: TEAMS_FILE, data });
}

function clone(): any {
  return structuredClone(TEAMS_DATA);
}

describe('loadTeams', () => {
  const teams = load(TEAMS_DATA);

  it.each(['offense', 'defense'] as const)('loads %s colors and jersey numbers', (side) => {
    const team = teams[side];
    expect(team.side).toBe(side);
    expect(team.colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(team.colors.secondary).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(team.jerseyNumbers)).toEqual([...ROLE_ORDER]);
  });

  it('uses different primary colors', () => {
    expect(teams.offense.colors.primary).not.toBe(teams.defense.colors.primary);
  });

  const cases: [string, (d: any) => void, string][] = [
    ['bad color', (d) => (d.offense.colors.primary = 'blue'), 'teams.offense.colors.primary'],
    ['missing jersey', (d) => delete d.defense.jerseyNumbers.C, 'teams.defense.jerseyNumbers.C'],
    [
      'jersey out of range',
      (d) => (d.offense.jerseyNumbers.PG = 100),
      'teams.offense.jerseyNumbers.PG',
    ],
    [
      'duplicate jersey',
      (d) => (d.offense.jerseyNumbers.SG = 3),
      'teams.offense.jerseyNumbers.SG',
    ],
    ['unknown side', (d) => (d.bench = d.offense), 'teams.bench'],
    [
      'same primary color',
      (d) => (d.defense.colors.primary = d.offense.colors.primary),
      'teams.defense.colors.primary',
    ],
  ];

  it.each(cases)('rejects %s', (_label, mutate, field) => {
    const data = clone();
    mutate(data);
    let error: unknown;
    try {
      load(data);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const err = error as ContentValidationError;
    expect(err.file).toBe(TEAMS_FILE);
    expect(err.field).toBe(field);
    expect(err.message).toContain('src/content/data/teams.ts');
    expect(err.message).toContain(field);
  });
});
