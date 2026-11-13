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
export {
  LOOK_QUALITIES,
  PASS_TYPES,
  PLAYER_COUNT,
  ROLE_ORDER,
  SHOT_TYPES,
  SHOT_ZONES,
  createGame,
  gameSimSeconds,
} from './state';
export type {
  BallState,
  CatchRecord,
  CourtPoint,
  CreateGameOptions,
  GameState,
  LookQuality,
  MovementProfile,
  MovementSetup,
  MovementTuning,
  PassFlightTuning,
  PassInterception,
  PassProfile,
  PassTuning,
  PassType,
  PassingSetup,
  PlayerState,
  RoleId,
  ShootingSetup,
  ShotProfile,
  ShotTuning,
  ShotType,
  ShotZone,
  SimAction,
  SimInput,
  TeamSide,
  Vec3,
} from './state';
export { stepGame } from './step';
export { PASS_TURNOVER_REASONS, passHeightAt } from './passing';
export {
  AIM_CONE_HALF_ANGLE_DEG,
  PASS_TARGETING_MODES,
  PASS_TARGET_BADGE_LABELS,
  PASS_TARGET_KEYS,
  PASS_TARGET_KEY_ROLES,
  passTargetBadgeLabel,
  passTargetBadges,
  resolvePassTarget,
} from './passTargeting';
export type {
  PassTargetBadge,
  PassTargetIntent,
  PassTargetKey,
  PassTargetingMode,
  PassTargetingSettings,
} from './passTargeting';
export {
  SHOT_REASONS,
  chooseShotType,
  rateLook,
  shotMakeChance,
  shotReleaseHeight,
  shotZoneAt,
} from './shooting';
export type { LookRating } from './shooting';
export { takeShot } from './takeShot';
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
  isBeyondArc,
  isInBounds,
} from './court';
export { runHeadless } from './runner';
export type { HeadlessRunOptions } from './runner';
