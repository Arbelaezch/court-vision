// The bundled playbook. Every file in `src/content/data/plays/` must be listed in
// BUNDLED_PLAY_SOURCES below, and each file is named `<playId>.ts`. playbook.test.ts fails when a
// play file is missing from the registry or the names disagree.

import { DRIBBLE_HANDOFF_DATA, DRIBBLE_HANDOFF_FILE } from './data/plays/dribbleHandoff';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import { HIGH_PICK_AND_ROLL_DATA, HIGH_PICK_AND_ROLL_FILE } from './data/plays/highPickAndRoll';
import type { RoleTable } from './roles';
import { loadScenarios, type ScenarioTable } from './scenarios';
import type { ContentSource } from './validate';

export const BUNDLED_PLAY_SOURCES: readonly ContentSource[] = [
  { file: GIVE_AND_GO_FILE, data: GIVE_AND_GO_DATA },
  { file: DRIBBLE_HANDOFF_FILE, data: DRIBBLE_HANDOFF_DATA },
  { file: HIGH_PICK_AND_ROLL_FILE, data: HIGH_PICK_AND_ROLL_DATA },
];

export function loadPlaybook(
  roles: RoleTable,
  sources: readonly ContentSource[] = BUNDLED_PLAY_SOURCES,
): ScenarioTable {
  return loadScenarios(sources, roles);
}
