/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { loadCastContent } from './cast';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import { DEFENDER_ACTIONS } from './plays';
import { loadScenario } from './scenarios';
import { ContentValidationError } from './validate';

const roles = loadCastContent().roles;

function loadWith(action: string) {
  const data: any = structuredClone(GIVE_AND_GO_DATA);
  data.coverages[1].script[1].defenders.PG.action = action;
  return loadScenario({ file: GIVE_AND_GO_FILE, data }, roles);
}

describe('defender actions', () => {
  it('includes closeoutHard', () => {
    expect(DEFENDER_ACTIONS).toContain('closeoutHard');
  });

  it('loads a coverage that uses closeoutHard', () => {
    expect(() => loadWith('closeoutHard')).not.toThrow();
  });

  it('still rejects an unknown action', () => {
    expect(() => loadWith('closeoutWild')).toThrow(ContentValidationError);
  });
});
