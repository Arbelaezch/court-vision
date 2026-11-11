// Loads the bundled cast (archetypes, roles, teams) in dependency order. No caching.

import { loadArchetypes, type ArchetypeTable } from './archetypes';
import { ARCHETYPES_DATA, ARCHETYPES_FILE } from './data/archetypes';
import { ROLES_DATA, ROLES_FILE } from './data/roles';
import { TEAMS_DATA, TEAMS_FILE } from './data/teams';
import { loadRoles, type RoleTable } from './roles';
import { loadTeams, type TeamCast } from './teams';
import type { ContentSource } from './validate';

export interface CastSources {
  readonly archetypes: ContentSource;
  readonly roles: ContentSource;
  readonly teams: ContentSource;
}

export interface CastContent {
  readonly archetypes: ArchetypeTable;
  readonly roles: RoleTable;
  readonly teams: TeamCast;
}

export const BUNDLED_CAST_SOURCES: CastSources = {
  archetypes: { file: ARCHETYPES_FILE, data: ARCHETYPES_DATA },
  roles: { file: ROLES_FILE, data: ROLES_DATA },
  teams: { file: TEAMS_FILE, data: TEAMS_DATA },
};

export function loadCastContent(sources: CastSources = BUNDLED_CAST_SOURCES): CastContent {
  const archetypes = loadArchetypes(sources.archetypes);
  const roles = loadRoles(sources.roles, archetypes);
  const teams = loadTeams(sources.teams);
  return { archetypes, roles, teams };
}
