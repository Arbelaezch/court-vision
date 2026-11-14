// AI layer: teammate and defender behavior driven by the data layer.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export {
  ARRIVE_SLOW_RADIUS_M,
  REACHED_SPOT_RADIUS_M,
  SCREEN_SET_SPEED_MPS,
  startPracticeRun,
  stepPracticeRun,
} from './playRun';
export { GRADE_REASONS, MISTAKE_REASONS, classifyAction, findDecisionPoint } from './grading';
export type { ActionClass, ResolvingAction } from './grading';
export {
  OUTCOME_RULES,
  WRONG_PASS_TYPE_GRADE_CAP,
  runGradeFor,
  startReferee,
  stepReferee,
} from './referee';
export type {
  GradedDecision,
  OutcomeRule,
  RefereeOptions,
  RefereeState,
  RunMode,
  RunOutcome,
  RunQuality,
} from './referee';
export {
  LANE_CLEAR_MARGIN_M,
  PG_LANE_HALF_WIDTH_M,
  SEPARATION_GAIN,
  SEPARATION_RADIUS_M,
  clearOfLane,
  distanceToSegment,
  separationPush,
} from './spacing';
export {
  CLOSEOUT_CUSHION_M,
  DEFENDER_BEHAVIORS,
  DEFENSE_ARRIVE_RADIUS_M,
  DEFENSE_SPRINT_DISTANCE_M,
  GUARD_CUSHION_M,
  HELP_CONTEST_GAP_M,
  HELP_CONTEST_RADIUS_M,
  defenderCommands,
  isInKey,
} from './defense';
export type { DefenderBehavior, DefenderContext, DefenderIntent } from './defense';
export type { PlayRunState, PracticeRunOptions } from './playRun';
