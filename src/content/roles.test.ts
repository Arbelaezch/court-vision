/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '../sim';
import { loadArchetypes } from './archetypes';
import { ARCHETYPES_DATA, ARCHETYPES_FILE } from './data/archetypes';
import { ROLES_DATA, ROLES_FILE } from './data/roles';
import { loadRoles } from './roles';
import { ContentValidationError } from './validate';

const archetypes = loadArchetypes({ file: ARCHETYPES_FILE, data: ARCHETYPES_DATA });

function load(data: unknown) {
  return loadRoles({ file: ROLES_FILE, data }, archetypes);
}

function catchError(fn: () => unknown): ContentValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ContentValidationError);
    return e as ContentValidationError;
  }
  throw new Error('expected loader to throw');
}

function clone(): any {
  return structuredClone(ROLES_DATA);
}

describe('loadRoles', () => {
  const roles = load(ROLES_DATA);

  it('loads the five roles in ROLE_ORDER', () => {
    expect(Object.keys(roles)).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    expect(Object.keys(roles)).toEqual([...ROLE_ORDER]);
  });

  it.each(ROLE_ORDER)('only PG is playable (%s)', (id) => {
    expect(roles[id].playable).toBe(id === 'PG');
  });

  it('references existing archetypes', () => {
    for (const id of ROLE_ORDER) {
      expect(archetypes[roles[id].defaultArchetype]).toBeDefined();
    }
  });

  it('names file and field when SG defaultArchetype is missing', () => {
    const data = clone();
    delete data.SG.defaultArchetype;
    const error = catchError(() => load(data));
    expect(error.file).toBe('src/content/data/roles.ts');
    expect(error.field).toBe('roles.SG.defaultArchetype');
    expect(error.message).toMatch(
      /src\/content\/data\/roles\.ts at roles\.SG\.defaultArchetype: missing required field/,
    );
  });

  it('rejects an unknown archetype', () => {
    const data = clone();
    data.C.defaultArchetype = 'giant';
    const error = catchError(() => load(data));
    expect(error.field).toBe('roles.C.defaultArchetype');
    expect(error.message).toContain('giant');
  });

  it('rejects a missing role', () => {
    const data = clone();
    delete data.PF;
    expect(catchError(() => load(data)).field).toBe('roles.PF');
  });

  it('rejects an extra role', () => {
    const data = clone();
    data.G = structuredClone(data.PG);
    expect(catchError(() => load(data)).field).toBe('roles.G');
  });

  it('rejects an unknown move', () => {
    const data = clone();
    data.PG.moves[0] = 'dunk';
    expect(catchError(() => load(data)).field).toBe('roles.PG.moves[0]');
  });

  it('rejects a duplicate role number', () => {
    const data = clone();
    data.SG.number = 1;
    const error = catchError(() => load(data));
    expect(error.field).toBe('roles.SG.number');
    expect(error.message).toContain('duplicate role number 1');
  });

  it('rejects when no role is playable', () => {
    const data = clone();
    data.PG.playable = false;
    expect(catchError(() => load(data)).field).toBe('roles');
  });
});
