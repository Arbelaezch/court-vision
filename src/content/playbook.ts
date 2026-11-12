// The bundled playbook. Every file in `src/content/data/plays/` must be listed in
// BUNDLED_PLAY_SOURCES below, and each file is named `<playId>.ts`. playbook.test.ts fails when a
// play file is missing from the registry or the names disagree.

import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import type { RoleTable } from './roles';
import { loadScenarios, type ScenarioTable } from './scenarios';
import type { ContentSource } from './validate';

export const BUNDLED_PLAY_SOURCES: readonly ContentSource[] = [
  { file: GIVE_AND_GO_FILE, data: GIVE_AND_GO_DATA },
];

export function loadPlaybook(
  roles: RoleTable,
  sources: readonly ContentSource[] = BUNDLED_PLAY_SOURCES,
): ScenarioTable {
  return loadScenarios(sources, roles);
}
