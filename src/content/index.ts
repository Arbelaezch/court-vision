// Content/data layer: plays, roles, archetypes, coverages, scenarios and tutorial content as
// validated data, loaded at startup. Invalid data must fail loudly with a helpful error.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export { ContentValidationError, ID_PATTERN, readId } from './validate';
export type { ContentSource, FieldPath } from './validate';
export { loadArchetypes } from './archetypes';
export type { Archetype, ArchetypeId, ArchetypeTable, ShootingByZone } from './archetypes';
export { BUNDLED_MOVEMENT_TUNING_SOURCE, loadMovementTuning } from './movement';
export type { MovementTuningSpec } from './movement';
export { BUNDLED_MASTERY_TUNING_SOURCE, loadMasteryTuning } from './mastery';
export type { MasteryTuningSpec } from './mastery';
export { BUNDLED_PASS_TUNING_SOURCE, loadPassTuning } from './passing';
export type { PassTuningSpec } from './passing';
export { BUNDLED_SHOT_TUNING_SOURCE, loadShotTuning } from './shooting';
export type { ShotTuningSpec } from './shooting';
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
export { loadSimShooting, simShootingSetup } from './simShooting';
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
export {
  CUE_TOGGLE_FOR_KIND,
  DEFAULT_CUE_TOGGLES,
  phaseCues,
  promptForCues,
  visibleCues,
} from './cues';
export type { CuePrompt, CueToggle, CueToggles } from './cues';
export {
  BUNDLED_MODE_SOURCES,
  MODE_RULES,
  SHOT_CLOCK_SECONDS_RANGE,
  SPEED_MULTIPLIER_RANGE,
  loadMode,
  loadModes,
  readModeConfig,
} from './modes';
export type { ModeConfig, ModeId, ModeRules, ModeTable } from './modes';
export { BUNDLED_PLAY_SOURCES, loadPlaybook } from './playbook';
export { SCENARIO_KINDS, loadScenario, loadScenarios } from './scenarios';
export type { Scenario, ScenarioKind, ScenarioTable } from './scenarios';
