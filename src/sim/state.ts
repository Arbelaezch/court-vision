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

/**
 * How the defense players take part. 'live': they intercept, contest and block. 'cones': they are
 * Practice cones (scripted, non-interactive) and never intercept, contest or block.
 */
export const DEFENSE_MODES = ['live', 'cones'] as const;
export type DefenseMode = (typeof DEFENSE_MODES)[number];

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

export type ShotType = 'layup' | 'jumper' | 'three' | 'pullUp' | 'catchAndShoot' | 'floater';
export const SHOT_TYPES: readonly ShotType[] = [
  'layup',
  'jumper',
  'three',
  'pullUp',
  'catchAndShoot',
  'floater',
];
/** Geometric shot zone; it picks the shooter's zone rating. */
export type ShotZone = 'rim' | 'midRange' | 'three';
export const SHOT_ZONES: readonly ShotZone[] = ['rim', 'midRange', 'three'];
export type LookQuality = 'great' | 'good' | 'bad';
export const LOOK_QUALITIES: readonly LookQuality[] = ['great', 'good', 'bad'];

/** Per-role shooting numbers, filled by content. Ratings are 0-100 (higher is better), reachM in m. */
export interface ShotProfile {
  /** Shooting rating by zone, 0-100. */
  shooting: { rim: number; midRange: number; three: number };
  /** Defensive awareness, 0-100. */
  defensiveAwareness: number;
  /** Standing reach, m. */
  reachM: number;
}

/** Global shooting numbers shared by every player. */
export interface ShotTuning {
  /** Within this distance of the rim centre the zone is `rim` and shoot picks a layup, m. */
  rimZoneRadiusM: number;
  /** A floater farther than this from the rim centre is ignored, m. */
  floaterMaxDistanceM: number;
  /** A shot farther than this from the rim centre is out of range, m. */
  maxRangeM: number;
  /** A zone rating below this (0-100) makes the shot out of range. */
  rangeRatingFloor: number;
  /** Ball height at release for a layup, m. */
  layupReleaseHeightM: number;
  /** Ball height at release for jumper, three, pull-up and catch-and-shoot, m. */
  jumpShotReleaseHeightM: number;
  /** Ball height at release for a floater, m. */
  floaterReleaseHeightM: number;
  /** The nearest defender contests when closer than this to the shooter, m. */
  contestRadiusM: number;
  /** Contest penalty at zero distance, look-score units (0-1). */
  contestWeight: number;
  /** A closing defender's distance is cut by closing speed times this, s. */
  closingLeadS: number;
  /** Contest and closing-out multiplier when the nearest defender is beaten, in [0, 1]. */
  beatenDefenderFactor: number;
  /** Defenders within this distance of the shooter contest at the rim (layup, floater), m. */
  rimContestRadiusM: number;
  /** Largest rim-contest penalty, look-score units (0-1). */
  rimContestWeight: number;
  /** Height span over which the rim contest ramps from 0 to full, m. */
  rimContestSpanM: number;
  /** Extra height above reachM a defender reaches by jumping, m. */
  contestJumpM: number;
  /** A shooter faster than this is off balance (jump shots only), m/s. */
  offBalanceSpeedMps: number;
  /** Off-balance penalty, look-score units (0-1). */
  offBalancePenalty: number;
  /** Out-of-range penalty, look-score units (0-1). */
  outOfRangePenalty: number;
  /** Fixed floater penalty, look-score units (0-1). */
  floaterPenalty: number;
  /** A look score at or above this is Great, in (goodMinScore, 1]. */
  greatMinScore: number;
  /** A look score at or above this is Good, in (0, 1]. */
  goodMinScore: number;
  /** A ball holder faster than this is dribbling (shoot picks a pull-up), m/s. */
  dribbleSpeedMps: number;
  /** A set catch at most this many ticks before the shot is catch-and-shoot, ticks (integer). */
  catchAndShootWindowTicks: number;
  /** Base make chance of a Great look, probability (0-1). */
  greatMakeChance: number;
  /** Base make chance of a Good look, probability (0-1). */
  goodMakeChance: number;
  /** Base make chance of a Bad look, probability (0-1). */
  badMakeChance: number;
  /** Make-chance shift per (zone rating - 50) / 100, probability units. */
  zoneRatingWeight: number;
  /** Lowest make chance after the rating shift, probability (0-1). */
  minMakeChance: number;
  /** Highest make chance after the rating shift, probability (0-1). */
  maxMakeChance: number;
  /** Defenders within this distance of the shooter (arm's reach) may block, m. */
  blockRadiusM: number;
  /** A block draw at or above this blocks, in (0, 1]. */
  blockThreshold: number;
  /** Weight of the (defensiveAwareness - shooter zone rating) / 100 block term. */
  blockRatingWeight: number;
  /** Half-width of the seeded random term added to each block score. */
  blockJitter: number;
}

export interface ShootingSetup {
  /** Both sides use the role's profile. */
  profiles: Record<RoleId, ShotProfile>;
  tuning: ShotTuning;
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
    }
  /** After a shot that was not blocked. Rebounds and inbounds come later; no one holds the ball. */
  | { kind: 'dead'; shooterId: number; made: boolean };

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
  /** Shooting numbers, or null when the game was created without them. */
  shooting: ShootingSetup | null;
  /**
   * The last completed catch, or null (none yet, the last pass was intercepted, or a shot was
   * taken since: it is cleared after every shot).
   */
  lastCatch: CatchRecord | null;
  /** 'cones': defense players are Practice cones and never intercept, contest or block. */
  defenseMode: DefenseMode;
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
  | { type: 'pass'; passType: PassType; targetId: number }
  | { type: 'shoot' }
  | { type: 'floater' };

/**
 * Commands for players other than the controlled one (AI teammates, Practice cones), applied by
 * stepGame before the actions. `steer` sets the move intent (clamped to length <= 1, like a move
 * action); `place` teleports the player and zeroes its velocity and intent; `pass` releases a pass
 * or hand-off from that player (ignored unless it holds the ball, as for the human).
 */
export type PlayerCommand =
  | { type: 'steer'; playerId: number; x: number; z: number }
  | { type: 'place'; playerId: number; x: number; z: number }
  | { type: 'pass'; playerId: number; passType: PassType; targetId: number };

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
  /** Shooting numbers, built from content by the caller (see content `loadSimShooting`). */
  shooting?: ShootingSetup;
  /** Default 'live'; anything else throws. */
  defenseMode?: DefenseMode;
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

const NON_NEGATIVE_SHOT_TUNING_KEYS = [
  'closingLeadS',
  'rimContestRadiusM',
  'contestJumpM',
  'offBalanceSpeedMps',
  'dribbleSpeedMps',
  'contestWeight',
  'rimContestWeight',
  'zoneRatingWeight',
  'blockRatingWeight',
  'offBalancePenalty',
  'outOfRangePenalty',
  'floaterPenalty',
  'blockJitter',
] as const;

const POSITIVE_SHOT_TUNING_KEYS = [
  'rimZoneRadiusM',
  'floaterMaxDistanceM',
  'maxRangeM',
  'contestRadiusM',
  'rimContestSpanM',
  'blockRadiusM',
  'layupReleaseHeightM',
  'jumpShotReleaseHeightM',
  'floaterReleaseHeightM',
] as const;

const UNIT_INTERVAL_SHOT_TUNING_KEYS = [
  'beatenDefenderFactor',
  'greatMakeChance',
  'goodMakeChance',
  'badMakeChance',
  'minMakeChance',
  'maxMakeChance',
] as const;

function validateShooting(setup: ShootingSetup): void {
  for (const role of ROLE_ORDER) {
    const profile = setup.profiles[role] as ShotProfile | undefined;
    if (profile === undefined) {
      throw new Error(`Court Vision: shooting setup has no profile for role ${role}`);
    }
    for (const zone of SHOT_ZONES) {
      requireNumber(
        `${role} shooting.${zone}`,
        profile.shooting[zone],
        (v) => v >= 0 && v <= 100,
        'in [0, 100]',
      );
    }
    requireNumber(
      `${role} defensiveAwareness`,
      profile.defensiveAwareness,
      (v) => v >= 0 && v <= 100,
      'in [0, 100]',
    );
    requireNumber(`${role} reachM`, profile.reachM, (v) => v > 0, '> 0');
  }
  const { tuning } = setup;
  for (const key of NON_NEGATIVE_SHOT_TUNING_KEYS) {
    requireNumber(key, tuning[key], (v) => v >= 0, '>= 0');
  }
  for (const key of POSITIVE_SHOT_TUNING_KEYS) {
    requireNumber(key, tuning[key], (v) => v > 0, '> 0');
  }
  for (const key of UNIT_INTERVAL_SHOT_TUNING_KEYS) {
    requireNumber(key, tuning[key], (v) => v >= 0 && v <= 1, 'in [0, 1]');
  }
  requireNumber(
    'rangeRatingFloor',
    tuning.rangeRatingFloor,
    (v) => v >= 0 && v <= 100,
    'in [0, 100]',
  );
  requireNumber('blockThreshold', tuning.blockThreshold, (v) => v > 0 && v <= 1, 'in (0, 1]');
  requireNumber('goodMinScore', tuning.goodMinScore, (v) => v > 0 && v <= 1, 'in (0, 1]');
  requireNumber(
    'greatMinScore',
    tuning.greatMinScore,
    (v) => v > tuning.goodMinScore && v <= 1,
    'in (goodMinScore, 1]',
  );
  requireNumber(
    'goodMakeChance',
    tuning.goodMakeChance,
    (v) => v <= tuning.greatMakeChance,
    '<= greatMakeChance',
  );
  requireNumber(
    'badMakeChance',
    tuning.badMakeChance,
    (v) => v <= tuning.goodMakeChance,
    '<= goodMakeChance',
  );
  requireNumber(
    'minMakeChance',
    tuning.minMakeChance,
    (v) => v <= tuning.maxMakeChance,
    '<= maxMakeChance',
  );
  requireNumber(
    'catchAndShootWindowTicks',
    tuning.catchAndShootWindowTicks,
    (v) => Number.isInteger(v) && v >= 0,
    'that is an integer >= 0',
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
  shooting,
  defenseMode = 'live',
}: CreateGameOptions): GameState {
  if (!(DEFENSE_MODES as readonly unknown[]).includes(defenseMode)) {
    throw new Error(
      `Court Vision: defenseMode must be one of ${DEFENSE_MODES.join(', ')}, got ${String(defenseMode)}`,
    );
  }
  validateMovement(movement);
  if (passing !== undefined) {
    validatePassing(passing);
  }
  if (shooting !== undefined) {
    validateShooting(shooting);
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
    shooting: shooting === undefined ? null : structuredClone(shooting),
    lastCatch: null,
    defenseMode,
    events: [],
  };
}

export function gameSimSeconds(state: GameState): number {
  return state.tick / SIM_HZ;
}
