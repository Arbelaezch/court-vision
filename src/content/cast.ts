// Loads the bundled cast (archetypes, roles, teams) in dependency order. No caching.

import { loadArchetypes, type ArchetypeTable } from './archetypes';
import { loadBodyTypes, type BodyTypeTable } from './bodyTypes';
import { ARCHETYPES_DATA, ARCHETYPES_FILE } from './data/archetypes';
import { BODY_TYPES_DATA, BODY_TYPES_FILE } from './data/bodyTypes';
import { ROLES_DATA, ROLES_FILE } from './data/roles';
import { TEAMS_DATA, TEAMS_FILE } from './data/teams';
import { loadRoles, type RoleTable } from './roles';
import { loadTeams, type TeamCast } from './teams';
import type { ContentSource } from './validate';

export interface CastSources {
  readonly archetypes: ContentSource;
  readonly roles: ContentSource;
  readonly teams: ContentSource;
  readonly bodyTypes: ContentSource;
}

export interface CastContent {
  readonly archetypes: ArchetypeTable;
  readonly roles: RoleTable;
  readonly teams: TeamCast;
  readonly bodyTypes: BodyTypeTable;
}

export const BUNDLED_CAST_SOURCES: CastSources = {
  archetypes: { file: ARCHETYPES_FILE, data: ARCHETYPES_DATA },
  roles: { file: ROLES_FILE, data: ROLES_DATA },
  teams: { file: TEAMS_FILE, data: TEAMS_DATA },
  bodyTypes: { file: BODY_TYPES_FILE, data: BODY_TYPES_DATA },
};

export function loadCastContent(sources: CastSources = BUNDLED_CAST_SOURCES): CastContent {
  const archetypes = loadArchetypes(sources.archetypes);
  const roles = loadRoles(sources.roles, archetypes);
  const teams = loadTeams(sources.teams);
  const bodyTypes = loadBodyTypes(sources.bodyTypes);
  return { archetypes, roles, teams, bodyTypes };
}
