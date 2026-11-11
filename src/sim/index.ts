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
export { runHeadless } from './runner';
export type { HeadlessRunOptions } from './runner';
