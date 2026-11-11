/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { loadArchetypes } from './archetypes';
import { ARCHETYPES_DATA, ARCHETYPES_FILE } from './data/archetypes';
import { ROLES_DATA, ROLES_FILE } from './data/roles';
import { loadRoles } from './roles';
import { ContentValidationError } from './validate';

const bundled = { file: ARCHETYPES_FILE, data: ARCHETYPES_DATA };

describe('loadArchetypes', () => {
  it('loads all five bundled archetypes', () => {
    const table = loadArchetypes(bundled);
    expect(Object.keys(table).sort()).toEqual(
      ['floorGeneral', 'rimProtector', 'sharpshooter', 'stretchForward', 'twoWayWing'].sort(),
    );
    expect(table.floorGeneral?.id).toBe('floorGeneral');
  });

  it('makes the center slower with more reach than the point guard', () => {
    const archetypes = loadArchetypes(bundled);
    const roles = loadRoles({ file: ROLES_FILE, data: ROLES_DATA }, archetypes);
    const pg = archetypes[roles.PG.defaultArchetype]!;
    const c = archetypes[roles.C.defaultArchetype]!;
    expect(c.speedMps).toBeLessThan(pg.speedMps);
    expect(c.accelerationMps2).toBeLessThan(pg.accelerationMps2);
    expect(c.reachM).toBeGreaterThan(pg.reachM);
  });

  it('returns a new object rather than the input', () => {
    const table = loadArchetypes(bundled);
    expect(table.rimProtector).not.toBe(ARCHETYPES_DATA.rimProtector);
  });

  it.each([
    [
      'missing speedMps',
      (d: any) => delete d.rimProtector.speedMps,
      'archetypes.rimProtector.speedMps',
    ],
    [
      'non-numeric reachM',
      (d: any) => (d.rimProtector.reachM = 'tall'),
      'archetypes.rimProtector.reachM',
    ],
    [
      'passing out of range',
      (d: any) => (d.rimProtector.passing = 101),
      'archetypes.rimProtector.passing',
    ],
    ['unknown key', (d: any) => (d.rimProtector.jumping = 50), 'archetypes.rimProtector.jumping'],
    [
      'missing shooting.three',
      (d: any) => delete d.rimProtector.shooting.three,
      'archetypes.rimProtector.shooting.three',
    ],
  ])('rejects %s naming file and field', (_label, mutate, field) => {
    const data = structuredClone(ARCHETYPES_DATA);
    mutate(data);
    let error: unknown;
    try {
      loadArchetypes({ file: ARCHETYPES_FILE, data });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const message = (error as Error).message;
    expect(message).toContain('src/content/data/archetypes.ts');
    expect(message).toContain(field);
  });
});
