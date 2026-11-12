/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { loadCastContent } from './cast';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import { loadScenario, loadScenarios } from './scenarios';
import { ContentValidationError } from './validate';

const roles = loadCastContent().roles;

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
  return structuredClone(GIVE_AND_GO_DATA);
}

describe('loadScenario', () => {
  it('rejects an unknown scenario kind', () => {
    const data = clone();
    data.kind = 'twoOnOne';
    const error = catchError(() => loadScenario({ file: GIVE_AND_GO_FILE, data }, roles));
    expect(error.field).toBe('giveAndGo.kind');
    expect(error.message).toMatch(/expected one of play/);
  });

  it('rejects a missing kind', () => {
    const data = clone();
    delete data.kind;
    const error = catchError(() => loadScenario({ file: GIVE_AND_GO_FILE, data }, roles));
    expect(error.field).toBe('giveAndGo.kind');
    expect(error.message).toMatch(/missing required field/);
  });
});

describe('loadScenarios', () => {
  it('returns a table keyed by scenario id', () => {
    const table = loadScenarios([{ file: GIVE_AND_GO_FILE, data: GIVE_AND_GO_DATA }], roles);
    expect(Object.keys(table)).toEqual(['giveAndGo']);
    expect(table.giveAndGo?.kind).toBe('play');
  });

  it('rejects a duplicate scenario id across sources', () => {
    const error = catchError(() =>
      loadScenarios(
        [
          { file: GIVE_AND_GO_FILE, data: GIVE_AND_GO_DATA },
          { file: 'src/content/data/plays/copy.ts', data: clone() },
        ],
        roles,
      ),
    );
    expect(error.file).toBe('src/content/data/plays/copy.ts');
    expect(error.field).toBe('giveAndGo.id');
    expect(error.message).toMatch(/duplicate scenario id "giveAndGo" \(also in src\/content/);
  });
});
