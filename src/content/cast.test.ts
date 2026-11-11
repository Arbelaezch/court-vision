/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '../sim';
import { ROLES_DATA } from './data/roles';
import {
  BODY_TYPES,
  BUNDLED_CAST_SOURCES,
  ContentValidationError,
  MOVE_IDS,
  loadArchetypes,
  loadCastContent,
  loadRoles,
  loadTeams,
} from './index';

describe('loadCastContent', () => {
  it('loads the bundled cast with only PG playable', () => {
    const cast = loadCastContent();
    expect(Object.keys(cast.roles)).toHaveLength(5);
    expect(Object.keys(cast.archetypes)).toHaveLength(5);
    expect(Object.keys(cast.teams)).toHaveLength(2);
    for (const id of ROLE_ORDER) expect(cast.roles[id].playable).toBe(id === 'PG');
  });

  it('takes the file name in errors from the source', () => {
    const badRoles: any = structuredClone(ROLES_DATA);
    delete badRoles.SG.defaultArchetype;
    expect(() =>
      loadCastContent({
        ...BUNDLED_CAST_SOURCES,
        roles: { file: 'custom/roles.ts', data: badRoles },
      }),
    ).toThrow(/custom\/roles\.ts.*roles\.SG\.defaultArchetype/);
  });

  it('exposes the public API from the barrel', () => {
    expect(typeof loadCastContent).toBe('function');
    expect(typeof loadArchetypes).toBe('function');
    expect(typeof loadRoles).toBe('function');
    expect(typeof loadTeams).toBe('function');
    expect(typeof ContentValidationError).toBe('function');
    expect(Object.keys(loadCastContent().roles)).toEqual([...ROLE_ORDER]);
    expect(MOVE_IDS).toContain('shoot');
    expect(BODY_TYPES).toContain('big');
  });
});
