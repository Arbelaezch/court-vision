// AI layer: teammate and defender behavior driven by the data layer.
// Headless: no three.js, no DOM, no imports from render/ui/input/audio/app (enforced by ESLint).
export {
  ARRIVE_SLOW_RADIUS_M,
  REACHED_SPOT_RADIUS_M,
  SCREEN_SET_SPEED_MPS,
  startPracticeRun,
  stepPracticeRun,
} from './playRun';
export {
  LANE_CLEAR_MARGIN_M,
  PG_LANE_HALF_WIDTH_M,
  SEPARATION_GAIN,
  SEPARATION_RADIUS_M,
  clearOfLane,
  distanceToSegment,
  separationPush,
} from './spacing';
export type { PlayRunState, PracticeRunOptions } from './playRun';
