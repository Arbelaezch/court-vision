import { describe, expect, it } from 'vitest';
import {
  ContentValidationError,
  childPath,
  getField,
  readArray,
  readBoolean,
  readEnum,
  readHexColor,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
} from './validate';

const root = rootPath('src/x.ts', 'root');

describe('childPath', () => {
  it('formats string and number keys', () => {
    const pg = childPath(rootPath('f', 'roles'), 'PG');
    expect(pg.field).toBe('roles.PG');
    expect(childPath(childPath(pg, 'moves'), 2).field).toBe('roles.PG.moves[2]');
  });
});

describe('getField', () => {
  it('throws with file, field and exact message when missing', () => {
    let error: unknown;
    try {
      getField({}, 'a', root);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentValidationError);
    const err = error as ContentValidationError;
    expect(err.file).toBe('src/x.ts');
    expect(err.field).toBe('root.a');
    expect(err.message).toMatch(
      /^Court Vision: invalid content in src\/x\.ts at root\.a: missing required field$/,
    );
  });

  it('treats undefined as missing and returns present values', () => {
    expect(() => getField({ a: undefined }, 'a', root)).toThrow(ContentValidationError);
    const got = getField({ a: 1 }, 'a', root);
    expect(got.value).toBe(1);
    expect(got.at.field).toBe('root.a');
  });
});

describe('rejectUnknownKeys', () => {
  it('names the unknown key', () => {
    expect(() => rejectUnknownKeys({ a: 1, b: 2 }, ['a'], root)).toThrow(
      expect.objectContaining({ field: 'root.b' }) as Error,
    );
    expect(() => rejectUnknownKeys({ a: 1 }, ['a'], root)).not.toThrow();
  });
});

describe('readNumber', () => {
  it.each([
    [NaN, {}],
    [Infinity, {}],
    ['fast', {}],
    [140, { min: 0, max: 100, integer: true }],
    [-1, { min: 0, max: 100 }],
    [1.5, { integer: true }],
  ])('rejects %s', (value, opts) => {
    expect(() => readNumber(value, root, opts)).toThrow(ContentValidationError);
  });

  it('describes the problem', () => {
    expect(() => readNumber(140, root, { min: 0, max: 100, integer: true })).toThrow(
      /expected integer 0\.\.100, got 140/,
    );
    expect(() => readNumber('fast', root)).toThrow(/expected number, got "fast"/);
  });

  it('accepts valid numbers', () => {
    expect(readNumber(5, root, { min: 0, max: 10, integer: true })).toBe(5);
    expect(readNumber(2.5, root)).toBe(2.5);
  });
});

describe('readEnum', () => {
  it('lists allowed values', () => {
    expect(() => readEnum('x', ['a', 'b', 'c'] as const, root)).toThrow(
      /expected one of a, b, c, got "x"/,
    );
    expect(readEnum('b', ['a', 'b', 'c'] as const, root)).toBe('b');
  });
});

describe('readHexColor', () => {
  it('accepts and lowercases', () => {
    expect(readHexColor('#A1b2C3', root)).toBe('#a1b2c3');
  });

  it.each(['red', '#fff', '#12345g', 5])('rejects %s', (value) => {
    expect(() => readHexColor(value, root)).toThrow(ContentValidationError);
  });
});

describe('readObject', () => {
  it.each([null, [], 'x', 3, undefined])('rejects %s', (value) => {
    expect(() => readObject(value, root)).toThrow(/expected object, got/);
  });

  it('accepts objects', () => {
    expect(readObject({ a: 1 }, root)).toEqual({ a: 1 });
  });
});

describe('readString, readBoolean, readArray', () => {
  it('validate kinds', () => {
    expect(readString('a', root)).toBe('a');
    expect(() => readString('  ', root)).toThrow(ContentValidationError);
    expect(readBoolean(false, root)).toBe(false);
    expect(() => readBoolean('true', root)).toThrow(ContentValidationError);
    expect(readArray([1], root)).toEqual([1]);
    expect(() => readArray({}, root)).toThrow(ContentValidationError);
  });
});
