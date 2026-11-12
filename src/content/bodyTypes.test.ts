/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { BODY_TYPES_DATA, BODY_TYPES_FILE } from './data/bodyTypes';
import {
  BODY_TYPES,
  BUNDLED_CAST_SOURCES,
  ContentValidationError,
  loadBodyTypes,
  loadCastContent,
} from './index';

const load = (data: unknown) => loadBodyTypes({ file: BODY_TYPES_FILE, data });

function expectInvalid(data: unknown, field: string): void {
  let error: unknown;
  try {
    load(data);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ContentValidationError);
  expect((error as ContentValidationError).file).toBe(BODY_TYPES_FILE);
  expect((error as ContentValidationError).field).toBe(field);
}

describe('loadBodyTypes', () => {
  it('loads the bundled data with all three body types', () => {
    const table = load(BODY_TYPES_DATA);
    expect(Object.keys(table)).toEqual([...BODY_TYPES]);
    expect(table.big.heightM).toBeGreaterThan(table.guard.heightM);
    expect(table.big.shoulderWidthM).toBeGreaterThan(table.guard.shoulderWidthM);
  });

  it('is part of the cast and every role body type resolves', () => {
    const cast = loadCastContent();
    expect(cast.bodyTypes.guard.id).toBe('guard');
    for (const role of Object.values(cast.roles)) {
      expect(cast.bodyTypes[role.bodyType]).toBeDefined();
    }
  });

  it('rejects a missing body type', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    delete bad.wing;
    expectInvalid(bad, 'bodyTypes.wing');
  });

  it('rejects an unknown body type', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.huge = bad.big;
    expectInvalid(bad, 'bodyTypes.huge');
  });

  it('rejects an unknown field', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.big.weight = 100;
    expectInvalid(bad, 'bodyTypes.big.weight');
  });

  it('rejects an out-of-range heightM', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.big.heightM = 2.6;
    expectInvalid(bad, 'bodyTypes.big.heightM');
  });

  it('rejects a non-number leanDeg', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.guard.leanDeg = 'lots';
    expectInvalid(bad, 'bodyTypes.guard.leanDeg');
  });

  it('rejects a head that is too large for the body', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.guard.heightM = 1.5;
    bad.guard.headRadiusM = 0.3;
    expectInvalid(bad, 'bodyTypes.guard.headRadiusM');
  });

  it('names the custom source file in cast errors', () => {
    const bad: any = structuredClone(BODY_TYPES_DATA);
    bad.big.heightM = 2.6;
    expect(() =>
      loadCastContent({
        ...BUNDLED_CAST_SOURCES,
        bodyTypes: { file: 'custom/bodyTypes.ts', data: bad },
      }),
    ).toThrow(/custom\/bodyTypes\.ts/);
  });
});
