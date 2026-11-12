// Scenario discriminator and loaders. Every scenario file is an object with an `id` and a
// `kind`; plays are the only kind in v1.
//
// To add a kind (e.g. a 2-on-1 or an endgame): add its value to SCENARIO_KINDS, add its type to
// the Scenario union, and add a `case` in loadScenario that calls its reader. The exhaustive
// `never` default makes the compiler point at the missing case.

import { readPlay, type PlayScenario } from './plays';
import type { RoleTable } from './roles';
import {
  childPath,
  fail,
  getField,
  readEnum,
  readId,
  readObject,
  rootPath,
  type ContentSource,
} from './validate';

export const SCENARIO_KINDS = ['play'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export type Scenario = PlayScenario;

export type ScenarioTable = Readonly<Record<string, Scenario>>;

export function loadScenario(source: ContentSource, roles: RoleTable): Scenario {
  const rootAt = rootPath(source.file, 'scenario');
  const obj = readObject(source.data, rootAt);
  const idField = getField(obj, 'id', rootAt);
  const id = readId(idField.value, idField.at);

  // From here on every field path is rooted at the scenario id, so errors name it.
  const at = rootPath(source.file, id);
  const kindField = getField(obj, 'kind', at);
  const kind = readEnum(kindField.value, SCENARIO_KINDS, kindField.at);
  switch (kind) {
    case 'play':
      return readPlay(obj, at, roles);
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function loadScenarios(sources: readonly ContentSource[], roles: RoleTable): ScenarioTable {
  const table: Record<string, Scenario> = {};
  const files = new Map<string, string>();
  for (const source of sources) {
    const scenario = loadScenario(source, roles);
    const otherFile = files.get(scenario.id);
    if (otherFile !== undefined) {
      fail(
        childPath(rootPath(source.file, scenario.id), 'id'),
        `duplicate scenario id "${scenario.id}" (also in ${otherFile})`,
      );
    }
    files.set(scenario.id, source.file);
    table[scenario.id] = scenario;
  }
  return table;
}
