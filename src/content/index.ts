// Content/data layer: plays, roles, archetypes, coverages, scenarios and tutorial content as
// validated data, loaded at startup. Invalid data must fail loudly with a helpful error.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export { ContentValidationError } from './validate';
export type { ContentSource, FieldPath } from './validate';
export { loadArchetypes } from './archetypes';
export type { Archetype, ArchetypeId, ArchetypeTable, ShootingByZone } from './archetypes';
export { BODY_TYPES, MOVE_IDS, loadRoles } from './roles';
export type { BodyType, MoveId, Role, RoleTable } from './roles';
export { loadTeams } from './teams';
export type { Team, TeamCast, TeamColors } from './teams';
export { BUNDLED_CAST_SOURCES, loadCastContent } from './cast';
export type { CastContent, CastSources } from './cast';
