// Simulation core: fixed-timestep game state, players, ball, movement, passing, shot resolution,
// look-quality, grading, rules.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export {
  MAX_SEED,
  cloneRng,
  createRng,
  nextFloat,
  nextInt,
  nextRange,
  nextUint32,
  pickOne,
} from './rng';
export type { RngState } from './rng';
export {
  FIXED_DT,
  MAX_FRAME_DELTA_MS,
  SIM_HZ,
  advanceStepper,
  createStepper,
  stepperAlpha,
  stepperSimSeconds,
} from './stepper';
export type { StepperState } from './stepper';
export { PLAYER_COUNT, ROLE_ORDER, createGame, gameSimSeconds } from './state';
export type {
  BallState,
  CourtPoint,
  CreateGameOptions,
  GameState,
  PlayerState,
  RoleId,
  SimAction,
  SimInput,
  TeamSide,
  Vec3,
} from './state';
export { PLACEHOLDER_MOVE_SPEED_MPS, stepGame } from './step';
export type { GameEvent, GameEventSink, MistakeKind, RunGrade } from './events';
export {
  BACKBOARD_BOTTOM_HEIGHT,
  BACKBOARD_FROM_BASELINE,
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  BASELINE_Z,
  CENTER_CIRCLE_RADIUS,
  COURT_LINE_WIDTH,
  FREE_THROW_CIRCLE_RADIUS,
  FREE_THROW_LINE_FROM_BASELINE,
  FREE_THROW_LINE_Z,
  HALF_COURT_DEPTH,
  HALF_COURT_LINE_Z,
  HALF_COURT_WIDTH,
  KEY_WIDTH,
  RIM_CENTER,
  RIM_CENTER_FROM_BASELINE,
  RIM_HEIGHT,
  RIM_RADIUS,
  SIDELINE_X,
  THREE_POINT_CORNER_END_Z,
  THREE_POINT_CORNER_FROM_SIDELINE,
  THREE_POINT_CORNER_X,
  THREE_POINT_RADIUS,
} from './court';
export { runHeadless } from './runner';
export type { HeadlessRunOptions } from './runner';
