// Content/data layer: plays, roles, archetypes, coverages, scenarios and tutorial content as
// validated data, loaded at startup. Invalid data must fail loudly with a helpful error.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export { ContentValidationError, ID_PATTERN, readId } from './validate';
export type { ContentSource, FieldPath } from './validate';
export { loadArchetypes } from './archetypes';
export type { Archetype, ArchetypeId, ArchetypeTable, ShootingByZone } from './archetypes';
export { BUNDLED_MOVEMENT_TUNING_SOURCE, loadMovementTuning } from './movement';
export type { MovementTuningSpec } from './movement';
export { BUNDLED_PASS_TUNING_SOURCE, loadPassTuning } from './passing';
export type { PassTuningSpec } from './passing';
export { BODY_TYPES, MOVE_IDS, loadRoles } from './roles';
export type { BodyType, MoveId, Role, RoleTable } from './roles';
export { loadBodyTypes } from './bodyTypes';
export type { BodyTypeSpec, BodyTypeTable } from './bodyTypes';
export { loadTeams } from './teams';
export type { Team, TeamCast, TeamColors } from './teams';
export { BUNDLED_CAST_SOURCES, loadCastContent } from './cast';
export type { CastContent, CastSources } from './cast';
export { loadSimMovement, simMovementSetup } from './simMovement';
export { loadSimPassing, simPassingSetup } from './simPassing';
export {
  CUE_KINDS,
  CUE_LEVELS,
  DECISION_GRADES,
  DEFENDER_ACTIONS,
  PASS_MOVES,
  TARGETED_TRACK_ACTIONS,
  TRACK_ACTIONS,
  TRIGGER_KINDS,
  readPlay,
} from './plays';
export type {
  Coverage,
  CoverageStep,
  Cue,
  CueKind,
  CueLevel,
  DecisionGrade,
  DecisionOption,
  DecisionPoint,
  DefenderAction,
  DefenderStep,
  Phase,
  PhaseCues,
  PhaseTransition,
  PhaseTrigger,
  PlayScenario,
  PlaySetup,
  TrackAction,
  TrackStep,
  TriggerKind,
} from './plays';
export { BUNDLED_PLAY_SOURCES, loadPlaybook } from './playbook';
export { SCENARIO_KINDS, loadScenario, loadScenarios } from './scenarios';
export type { Scenario, ScenarioKind, ScenarioTable } from './scenarios';
