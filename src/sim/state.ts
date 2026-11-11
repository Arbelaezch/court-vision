// Game state shape and the initial game. State is plain data (no classes, no functions) so it
// deep-compares, serializes, and a snapshot fully determines the future.
//
// Coordinates: meters on the floor plane { x, z }, origin at the court centre, -z toward the basket,
// y up (ball only). Court dimensions live in ./court.ts.

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

export interface PlayerState {
  id: number;
  side: TeamSide;
  role: RoleId;
  pos: CourtPoint;
  vel: CourtPoint;
  moveIntent: CourtPoint;
}

export type BallState =
  | { kind: 'held'; holderId: number }
  | { kind: 'inFlight'; pos: Vec3; vel: Vec3; fromId: number; targetId: number | null };

export interface GameState {
  seed: number;
  tick: number;
  rng: RngState;
  players: PlayerState[];
  ball: BallState;
  controlledPlayerId: number;
  /** Remaining shot clock in ticks, or null when the mode has no shot clock. */
  shotClockTicks: number | null;
}

export type SimAction = { type: 'move'; x: number; z: number };

export interface SimInput {
  tick: number;
  action: SimAction;
}

export interface CreateGameOptions {
  seed: number;
  shotClockSeconds?: number | null;
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

function createPlayers(): PlayerState[] {
  const players: PlayerState[] = [];
  const sides: readonly TeamSide[] = ['offense', 'defense'];
  sides.forEach((side, sideIndex) => {
    ROLE_ORDER.forEach((role, roleIndex) => {
      const spot = PLACEHOLDER_OFFENSE_SPOTS[roleIndex];
      if (spot === undefined) {
        throw new Error(`Court Vision: no placeholder spot for role ${role}`);
      }
      const dz = side === 'defense' ? PLACEHOLDER_DEFENSE_OFFSET_Z : 0;
      players.push({
        id: sideIndex * ROLE_ORDER.length + roleIndex,
        side,
        role,
        pos: { x: spot.x, z: spot.z + dz },
        vel: { x: 0, z: 0 },
        moveIntent: { x: 0, z: 0 },
      });
    });
  });
  return players;
}

export function createGame({ seed, shotClockSeconds = null }: CreateGameOptions): GameState {
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
    players: createPlayers(),
    ball: { kind: 'held', holderId: 0 },
    controlledPlayerId: 0,
    shotClockTicks,
  };
}

export function gameSimSeconds(state: GameState): number {
  return state.tick / SIM_HZ;
}
