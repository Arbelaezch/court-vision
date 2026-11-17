// AI layer: teammate and defender behavior driven by the data layer.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export {
  ARRIVE_SLOW_RADIUS_M,
  REACHED_SPOT_RADIUS_M,
  SCREEN_HOLD_CLEAR_M,
  SCREEN_HOLD_TIMEOUT_S,
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
export type { PlayRunState, PracticeRunOptions, ScreenHold } from './playRun';
export { OPENING_SEPARATION_M, isTeammateOpen } from './openings';
export {
  COVERAGE_PICK_SALT,
  RESULT_HOLD_SECONDS,
  RESULT_HOLD_STEPS,
  coverageForRun,
  quitRunController,
  restartRunController,
  startRunController,
  stepRunController,
} from './runController';
export type {
  RunAttempt,
  RunControllerOptions,
  RunControllerState,
  RunControllerStatus,
  RunControllerStep,
} from './runController';
export {
  PREVIEW_MAX_COVERAGE_STEPS,
  previewCoverageName,
  startPreviewLoop,
  stepPreviewLoop,
} from './previewLoop';
export type { PreviewLoopState, PreviewLoopStep } from './previewLoop';
export {
  correctReadMove,
  createCorrectReadBot,
  createWrongReadBot,
  wrongReadMove,
} from './playBots';
export type { BotMove, PlayBot, PlayBotView } from './playBots';
export {
  TUTORIAL_FINISH_HOLD_STEPS,
  TUTORIAL_STEP_HOLD_STEPS,
  currentTutorialStep,
  startTutorial,
  stepTutorial,
} from './tutorialSandbox';
export type {
  TutorialSandboxOptions,
  TutorialState,
  TutorialStatus,
  TutorialStepResult,
} from './tutorialSandbox';
