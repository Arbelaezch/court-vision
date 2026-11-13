// Game state shape and the initial game. State is plain data (no classes, no functions) so it
// deep-compares, serializes, and a snapshot fully determines the future.
//
// Coordinates: meters on the floor plane { x, z }, origin at the court centre, -z toward the basket,
// y up (ball only). Court dimensions live in ./court.ts.

import type { GameEvent } from './events';
import { createRng } from './rng';
import type { RngState } from './rng';
import { SIM_HZ } from './stepper';

export type TeamSide = 'offense' | 'defense';
export type RoleId = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const PLAYER_COUNT = 10;
export const ROLE_ORDER: readonly RoleId[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export interface CourtPoint {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Per-player movement numbers. Plain data filled in by the content layer (sim never reads content). */
export interface MovementProfile {
  /** Run (non-sprint) top speed, m/s. */
  speedMps: number;
  /** Acceleration toward the target velocity, m/s^2. */
  accelerationMps2: number;
}

/** Global movement numbers shared by every player. */
export interface MovementTuning {
  /** Sprint top speed = speedMps * this, >= 1. */
  sprintSpeedMultiplier: number;
  /** Braking rate = accelerationMps2 * this, >= 1. */
  brakingMultiplier: number;
  /** Seconds of continuous sprint from full to empty stamina, > 0. */
  sprintDurationS: number;
  /** Seconds to refill from empty to full when not sprinting, > 0. */
  staminaRefillS: number;
}

export interface MovementSetup {
  /** Both sides use the role's profile. */
  profiles: Record<RoleId, MovementProfile>;
  tuning: MovementTuning;
}

export interface PlayerState {
  id: number;
  side: TeamSide;
  role: RoleId;
  pos: CourtPoint;
  vel: CourtPoint;
  moveIntent: CourtPoint;
  movement: MovementProfile;
  /** Sprint stamina as a fraction in [0, 1]; starts at 1. */
  stamina: number;
  /** Held sprint input. */
  sprintHeld: boolean;
  /** Whether the player actually sprinted on the last step. */
  sprinting: boolean;
  /** Held pivot input. */
  pivotHeld: boolean;
  /** Protect state; true while pivot is held. */
  protecting: boolean;
}

export type PassType = 'chestPass' | 'bouncePass' | 'lob' | 'handOff';
export const PASS_TYPES: readonly PassType[] = ['chestPass', 'bouncePass', 'lob', 'handOff'];

/** Per-role passing numbers, filled by content. Ratings are 0-100 (higher is better), reachM in m. */
export interface PassProfile {
  passing: number;
  ballSecurity: number;
  defensiveAwareness: number;
  /** Standing reach, m. */
  reachM: number;
}

export interface PassFlightTuning {
  /** Horizontal ball speed, m/s. */
  speedMps: number;
  /** Ball height at release, m. */
  releaseHeightM: number;
  /** Ball height on arrival at the receiver, m. */
  catchHeightM: number;
  /** Defenders within this horizontal distance of the receiver contest the catch, m. */
  catchRadiusM: number;
}

export interface PassTuning {
  chestPass: PassFlightTuning;
  /** bounceAtFraction: path fraction in (0, 1) where the ball touches the floor (y = 0). */
  bouncePass: PassFlightTuning & { bounceAtFraction: number };
  /** apexHeightM: ball height at mid-flight, m. */
  lob: PassFlightTuning & { apexHeightM: number };
  /** maxDistanceM: a hand-off to a teammate farther than this is ignored, m. */
  handOff: PassFlightTuning & { maxDistanceM: number };
  /** Defenders within this horizontal distance of the ball path contest the lane, m. */
  laneRadiusM: number;
  /** Lowest ball height a defender can contest, m. */
  contestLowM: number;
  /** Extra height above reachM a defender can contest by jumping, m. */
  contestJumpM: number;
  /** A threat intercepts when its score is >= this, in (0, 1]. */
  interceptThreshold: number;
  /** Weight of the (defensiveAwareness - passer or receiver rating) / 100 term. */
  ratingWeight: number;
  /** Half-width of the seeded random term added to each threat score. */
  jitter: number;
  /** A receiver at or below this speed on the catch counts as set, m/s. */
  setSpeedMps: number;
}

export interface PassingSetup {
  /** Both sides use the role's profile. */
  profiles: Record<RoleId, PassProfile>;
  tuning: PassTuning;
}

/**
 * A lane interception decided at release, applied when the flight reaches atTick. Catch-zone
 * interceptions are decided on the arrival tick instead (./passing.ts).
 */
export interface PassInterception {
  defenderId: number;
  /** Flight tick (1-based elapsedTicks) at which the defender takes the ball. */
  atTick: number;
  reason: string;
}

/** The last completed catch, kept for catch-and-shoot. */
export interface CatchRecord {
  playerId: number;
  passType: PassType;
  tick: number;
  /** True when the receiver was (nearly) stationary on the catch. */
  set: boolean;
}

export type BallState =
  | { kind: 'held'; holderId: number }
  | {
      kind: 'inFlight';
      pos: Vec3;
      vel: Vec3;
      fromId: number;
      targetId: number;
      passType: PassType;
      origin: Vec3;
      elapsedTicks: number;
      flightTicks: number;
      interception: PassInterception | null;
    };

export interface GameState {
  seed: number;
  tick: number;
  rng: RngState;
  players: PlayerState[];
  ball: BallState;
  controlledPlayerId: number;
  /** Remaining shot clock in ticks, or null when the mode has no shot clock. */
  shotClockTicks: number | null;
  movementTuning: MovementTuning;
  /** Passing numbers, or null when the game was created without them (pass actions then throw). */
  passing: PassingSetup | null;
  /** The last completed catch, or null (none yet, or the last pass was intercepted). */
  lastCatch: CatchRecord | null;
  /**
   * Events produced by the step that created this state; the caller forwards them to its
   * GameEventSinks. Empty after createGame.
   */
  events: GameEvent[];
}

/**
 * Sim inputs for the controlled player. `sprint` and `pivot` are held inputs: the flag persists
 * until the next action of the same type, so callers may send them every tick or only on change.
 */
export type SimAction =
  | { type: 'move'; x: number; z: number }
  | { type: 'sprint'; held: boolean }
  | { type: 'pivot'; held: boolean }
  | { type: 'pass'; passType: PassType; targetId: number };

export interface SimInput {
  tick: number;
  action: SimAction;
}

export interface CreateGameOptions {
  seed: number;
  shotClockSeconds?: number | null;
  /** Movement numbers, built from content by the caller (see content `loadSimMovement`). */
  movement: MovementSetup;
  /** Passing numbers, built from content by the caller (see content `loadSimPassing`). */
  passing?: PassingSetup;
}

// Placeholder offense spots in ROLE_ORDER (meters). Plays set real spots later.
const PLACEHOLDER_OFFENSE_SPOTS: readonly CourtPoint[] = [
  { x: 0, z: 2 },
  { x: 4.5, z: -1 },
  { x: -4.5, z: -1 },
  { x: 2.5, z: -4.5 },
  { x: -2.5, z: -4.5 },
];

// Defenders start 1 m closer to the basket than their matchup.
const PLACEHOLDER_DEFENSE_OFFSET_Z = -1;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validateMovement(movement: MovementSetup): void {
  for (const role of ROLE_ORDER) {
    const profile = movement.profiles[role] as MovementProfile | undefined;
    if (profile === undefined) {
      throw new Error(`Court Vision: movement setup has no profile for role ${role}`);
    }
    if (!isPositiveFinite(profile.speedMps)) {
      throw new Error(
        `Court Vision: ${role} speedMps must be a finite number > 0, got ${profile.speedMps}`,
      );
    }
    if (!isPositiveFinite(profile.accelerationMps2)) {
      throw new Error(
        `Court Vision: ${role} accelerationMps2 must be a finite number > 0, got ${profile.accelerationMps2}`,
      );
    }
  }
  const { tuning } = movement;
  for (const key of ['sprintSpeedMultiplier', 'brakingMultiplier'] as const) {
    if (!Number.isFinite(tuning[key]) || tuning[key] < 1) {
      throw new Error(`Court Vision: ${key} must be a finite number >= 1, got ${tuning[key]}`);
    }
  }
  for (const key of ['sprintDurationS', 'staminaRefillS'] as const) {
    if (!isPositiveFinite(tuning[key])) {
      throw new Error(`Court Vision: ${key} must be a finite number > 0, got ${tuning[key]}`);
    }
  }
}

const NON_NEGATIVE_PASS_TUNING_KEYS = [
  'contestLowM',
  'contestJumpM',
  'ratingWeight',
  'jitter',
  'setSpeedMps',
] as const;

function requireNumber(
  name: string,
  value: number,
  ok: (v: number) => boolean,
  rule: string,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !ok(value)) {
    throw new Error(`Court Vision: ${name} must be a finite number ${rule}, got ${String(value)}`);
  }
}

function validatePassing(setup: PassingSetup): void {
  for (const role of ROLE_ORDER) {
    const profile = setup.profiles[role] as PassProfile | undefined;
    if (profile === undefined) {
      throw new Error(`Court Vision: passing setup has no profile for role ${role}`);
    }
    for (const key of ['passing', 'ballSecurity', 'defensiveAwareness'] as const) {
      requireNumber(`${role} ${key}`, profile[key], (v) => v >= 0 && v <= 100, 'in [0, 100]');
    }
    requireNumber(`${role} reachM`, profile.reachM, (v) => v > 0, '> 0');
  }
  const { tuning } = setup;
  for (const type of PASS_TYPES) {
    const flight = tuning[type] as PassFlightTuning | undefined;
    if (flight === undefined) {
      throw new Error(`Court Vision: passing tuning has no entry for pass type ${type}`);
    }
    for (const key of ['speedMps', 'releaseHeightM', 'catchHeightM'] as const) {
      requireNumber(`${type}.${key}`, flight[key], (v) => v > 0, '> 0');
    }
    requireNumber(`${type}.catchRadiusM`, flight.catchRadiusM, (v) => v >= 0, '>= 0');
  }
  requireNumber(
    'bouncePass.bounceAtFraction',
    tuning.bouncePass.bounceAtFraction,
    (v) => v > 0 && v < 1,
    'in (0, 1)',
  );
  const { lob } = tuning;
  requireNumber(
    'lob.apexHeightM',
    lob.apexHeightM,
    (v) => v > lob.releaseHeightM && v > lob.catchHeightM,
    'above the lob release and catch heights',
  );
  requireNumber('handOff.maxDistanceM', tuning.handOff.maxDistanceM, (v) => v > 0, '> 0');
  requireNumber('laneRadiusM', tuning.laneRadiusM, (v) => v > 0, '> 0');
  for (const key of NON_NEGATIVE_PASS_TUNING_KEYS) {
    requireNumber(key, tuning[key], (v) => v >= 0, '>= 0');
  }
  requireNumber(
    'interceptThreshold',
    tuning.interceptThreshold,
    (v) => v > 0 && v <= 1,
    'in (0, 1]',
  );
}

function createPlayers(profiles: Readonly<Record<RoleId, MovementProfile>>): PlayerState[] {
  const players: PlayerState[] = [];
  const sides: readonly TeamSide[] = ['offense', 'defense'];
  sides.forEach((side, sideIndex) => {
    ROLE_ORDER.forEach((role, roleIndex) => {
      const spot = PLACEHOLDER_OFFENSE_SPOTS[roleIndex];
      if (spot === undefined) {
        throw new Error(`Court Vision: no placeholder spot for role ${role}`);
      }
      const dz = side === 'defense' ? PLACEHOLDER_DEFENSE_OFFSET_Z : 0;
      const { speedMps, accelerationMps2 } = profiles[role];
      players.push({
        id: sideIndex * ROLE_ORDER.length + roleIndex,
        side,
        role,
        pos: { x: spot.x, z: spot.z + dz },
        vel: { x: 0, z: 0 },
        moveIntent: { x: 0, z: 0 },
        movement: { speedMps, accelerationMps2 },
        stamina: 1,
        sprintHeld: false,
        sprinting: false,
        pivotHeld: false,
        protecting: false,
      });
    });
  });
  return players;
}

export function createGame({
  seed,
  shotClockSeconds = null,
  movement,
  passing,
}: CreateGameOptions): GameState {
  validateMovement(movement);
  if (passing !== undefined) {
    validatePassing(passing);
  }
  let shotClockTicks: number | null = null;
  if (shotClockSeconds !== null) {
    if (!Number.isFinite(shotClockSeconds) || shotClockSeconds <= 0) {
      throw new Error(
        `Court Vision: shot clock must be a finite number > 0 seconds, got ${shotClockSeconds}`,
      );
    }
    shotClockTicks = Math.round(shotClockSeconds * SIM_HZ);
  }
  return {
    seed,
    tick: 0,
    rng: createRng(seed),
    players: createPlayers(movement.profiles),
    ball: { kind: 'held', holderId: 0 },
    controlledPlayerId: 0,
    shotClockTicks,
    movementTuning: {
      sprintSpeedMultiplier: movement.tuning.sprintSpeedMultiplier,
      brakingMultiplier: movement.tuning.brakingMultiplier,
      sprintDurationS: movement.tuning.sprintDurationS,
      staminaRefillS: movement.tuning.staminaRefillS,
    },
    passing: passing === undefined ? null : structuredClone(passing),
    lastCatch: null,
    events: [],
  };
}

export function gameSimSeconds(state: GameState): number {
  return state.tick / SIM_HZ;
}
