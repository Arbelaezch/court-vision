// Defender behavior library for live defense: a pure map from each coverage DefenderAction name to
// a steering behavior, plus `defenderCommands`, which turns a coverage step into sim commands.
//
// Rules this file keeps:
//   - Defenders move only through `steer` commands (move intent plus a sprint flag), so the sim
//     enforces the archetype speed, acceleration and stamina limits. A defender never teleports.
//   - Behaviors are pure and deterministic: no RNG, no randomness, no wall clock. The same game
//     state and step always give the same command.
//   - Decision g5: no steals on the dribbler. Behaviors never emit `pass` or `place` and never touch
//     the ball. Blocks happen only through `takeShot`, interceptions only through `passing.ts`.
//   - Each coverage defender is keyed by the offensive role it guards: its `man` is the offense
//     player with that role, and `self` is the defense player with that role.
//
// Behaviors per action:
//   guard       hold a cushion (GUARD_CUSHION_M) from the man toward the rim, mirroring the man's
//               velocity as feed-forward plus a pull toward the cushion point. The
//               point shifts sideways off his passing lanes (to every teammate);
//               the scripted `spot` is only the start position, never read by guard-like actions;
//   recover     like guard, but sprints back whenever it is more than 0.5 m off the cushion point;
//   closeout    controlled: sprint in, then break down and stop CLOSEOUT_CUSHION_M from the man;
//   closeoutHard over-aggressive: full sprint straight at the man with no breakdown, so it overruns
//               and has to brake and reverse when the man drives past;
//   sag, help   seek the scripted spot; help steps up on a ball holder near the rim to contest;
//   chaseOver, goUnder, switch, drop, hedge
//               generic "go to the scripted spot" until a screen play needs more.
//
// Known sim exemption (A1): when a defender reaches the baseline, a sideline or the half-court line,
// src/sim/step.ts clamps its position and zeroes the velocity component in one tick, which can
// exceed the per-tick acceleration bound. Behaviors do not avoid walls; the scripted plays keep
// defenders off them (see liveDefense.test.ts, "never reaches a wall").
//
// Imports only from the sim barrel (and content types); it must not import ./playRun (cycle).

import type { DefenderAction, DefenderStep } from '../content';
import {
  BASELINE_Z,
  FREE_THROW_LINE_Z,
  HALF_COURT_LINE_Z,
  KEY_WIDTH,
  RIM_CENTER,
  ROLE_ORDER,
  SIDELINE_X,
  type CourtPoint,
  type GameState,
  type PlayerCommand,
  type PlayerState,
  type RoleId,
} from '../sim';

/** A set defender's gap from its man toward the rim, m. */
export const GUARD_CUSHION_M = 1.5;
/** A controlled closeout stops this far from its man, m. */
export const CLOSEOUT_CUSHION_M = 1.0;
/** Farther than this from the target: sprint, m. */
export const DEFENSE_SPRINT_DISTANCE_M = 2.0;
/** A spot-seeking steer ramps down inside this distance, m. */
export const DEFENSE_ARRIVE_RADIUS_M = 1.5;
/** A ball holder this close to the rim makes a help defender step up, m. */
export const HELP_CONTEST_RADIUS_M = 3.0;
/** Help contest spot: this far from the holder toward the rim, m. */
export const HELP_CONTEST_GAP_M = 0.6;

/** Lane radius used when the game has no passing setup, m. */
const DEFAULT_LANE_RADIUS_M = 0.9;
/** A guard keeps this much beyond the interception lane radius from the passing lane, m. */
const LANE_MARGIN_M = 0.35;
/** Above this speed a man is driving and his guard stops shifting off passing lanes, m/s. */
const DRIVE_SPEED_MPS = 2.5;
/** A lane-shifted guard point stays this far inside the court lines, m. */
const WALL_MARGIN_M = 0.4;
/** Passing lanes aim at a teammate's position this far ahead, s. */
const LANE_LOOKAHEAD_S = 0.35;
/** Lanes nearly parallel to the sidestep direction are ignored (cannot be cleared by sliding). */
const LANE_MIN_FACING = 0.2;
/** Cap on the slide along the fixed side, as a multiple of the lane clearance. */
const LANE_MAX_SLIDE_FACTOR = 2;

/** Recover sprints whenever it is farther than this from its target, m. */
const RECOVER_SPRINT_DISTANCE_M = 0.5;
/** Below this distance a seek steer is zero, m. */
const SEEK_EPSILON_M = 0.05;

export interface DefenderIntent {
  x: number;
  z: number;
  sprint: boolean;
}

export interface DefenderContext {
  game: GameState;
  self: PlayerState;
  man: PlayerState;
  step: DefenderStep;
}

export type DefenderBehavior = (ctx: DefenderContext) => DefenderIntent;

function dist(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The point on the segment man -> rim at `min(cushion, distance to rim)` from the man. */
export function guardPoint(man: PlayerState, cushion: number): CourtPoint {
  const dx = RIM_CENTER.x - man.pos.x;
  const dz = RIM_CENTER.z - man.pos.z;
  const d = Math.hypot(dx, dz);
  if (d === 0) return { x: man.pos.x, z: man.pos.z };
  const gap = Math.min(cushion, d);
  return { x: man.pos.x + (dx / d) * gap, z: man.pos.z + (dz / d) * gap };
}

/** Steer toward `target`, ramping down inside DEFENSE_ARRIVE_RADIUS_M; zero when nearly there. */
function seek(self: PlayerState, target: CourtPoint): { x: number; z: number } {
  const dx = target.x - self.pos.x;
  const dz = target.z - self.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < SEEK_EPSILON_M) return { x: 0, z: 0 };
  const scale = Math.max(d, DEFENSE_ARRIVE_RADIUS_M);
  return { x: dx / scale, z: dz / scale };
}

function topSpeed(self: PlayerState, game: GameState, sprint: boolean): number {
  return self.movement.speedMps * (sprint ? game.movementTuning.sprintSpeedMultiplier : 1);
}

/**
 * Shift `target` sideways until it is at least `laneClearM` from the passing lane (the segment
 * man -> teammate), for each teammate in turn. The slide is always to one fixed side of the
 * man->rim line (toward the man's half of the court), so it is continuous and deterministic.
 * Best effort: a later teammate's slide can leave an earlier lane, and the wall clamp runs last.
 */
function clearOfLanes(
  man: PlayerState,
  target: CourtPoint,
  game: GameState,
  onlyTo: PlayerState | null = null,
): CourtPoint {
  const laneClearM = (game.passing?.tuning.laneRadiusM ?? DEFAULT_LANE_RADIUS_M) + LANE_MARGIN_M;
  let { x, z } = target;
  // Fixed side: perpendicular to the man->rim line, toward the man's own half of the court.
  const rdx = RIM_CENTER.x - man.pos.x;
  const rdz = RIM_CENTER.z - man.pos.z;
  const rd = Math.hypot(rdx, rdz) || 1;
  const leftX = -rdz / rd;
  const leftZ = rdx / rd;
  const flip = leftX * man.pos.x < 0 ? -1 : 1;
  const sideX = leftX * flip;
  const sideZ = leftZ * flip;
  for (const mate of game.players) {
    if (mate.side !== 'offense' || mate.id === man.id) continue;
    if (onlyTo !== null && mate.id !== onlyTo.id) continue;
    // Aim at where the teammate will be: a pass to a moving receiver is led the same way.
    const lx = mate.pos.x + mate.vel.x * LANE_LOOKAHEAD_S - man.pos.x;
    const lz = mate.pos.z + mate.vel.z * LANE_LOOKAHEAD_S - man.pos.z;
    const len = Math.hypot(lx, lz);
    if (len === 0) continue;
    const tx = x - man.pos.x;
    const tz = z - man.pos.z;
    const along = (tx * lx + tz * lz) / (len * len);
    if (along <= 0 || along >= 1) continue;
    const signed = (lx * tz - lz * tx) / len;
    // Always step to one fixed side of the man->rim line (set by the caller) and slide along it
    // until this lane is cleared on that side. Unlike picking the side per lane, the target then
    // moves continuously when a teammate crosses the man->rim line.
    const nx = -lz / len;
    const nz = lx / len;
    const facing = nx * sideX + nz * sideZ;
    if (Math.abs(facing) < LANE_MIN_FACING) continue;
    const sgn = facing > 0 ? 1 : -1;
    const room = laneClearM - sgn * signed;
    if (room <= 0) continue;
    const k = Math.min(room / Math.abs(facing), laneClearM * LANE_MAX_SLIDE_FACTOR);
    x += sideX * k;
    z += sideZ * k;
  }
  // Stay off the walls: the sim zeroes velocity at a wall, which breaks the acceleration limit.
  return {
    x: Math.max(-SIDELINE_X + WALL_MARGIN_M, Math.min(SIDELINE_X - WALL_MARGIN_M, x)),
    z: Math.max(BASELINE_Z + WALL_MARGIN_M, Math.min(HALF_COURT_LINE_Z - WALL_MARGIN_M, z)),
  };
}

function guardLike(ctx: DefenderContext, sprintRadius: number | null): DefenderIntent {
  const { game, self, man } = ctx;
  const cushion = guardPoint(man, GUARD_CUSHION_M);
  // Decision 2026-11-14: a set defender stays between its man and the rim but shifts off his
  // passing lanes, so scripted passes stay open. It does this before its man gets the ball: a
  // lateral slide cannot start after the catch and still beat an immediate pass.
  // A man driving at speed is defended on the drive, not on his passes.
  const driving = man.sprinting || Math.hypot(man.vel.x, man.vel.z) > DRIVE_SPEED_MPS;
  const target = driving ? cushion : clearOfLanes(man, cushion, game);
  const d = dist(self.pos, target);
  const sprint =
    sprintRadius === null ? man.sprinting || d > DEFENSE_SPRINT_DISTANCE_M : d > sprintRadius;
  const top = topSpeed(self, game, sprint);
  return {
    x: man.vel.x / top + (target.x - self.pos.x) / DEFENSE_ARRIVE_RADIUS_M,
    z: man.vel.z / top + (target.z - self.pos.z) / DEFENSE_ARRIVE_RADIUS_M,
    sprint,
  };
}

function seekSpot(ctx: DefenderContext, target: CourtPoint, forceSprint = false): DefenderIntent {
  const steer = seek(ctx.self, target);
  return {
    x: steer.x,
    z: steer.z,
    sprint: forceSprint || dist(ctx.self.pos, target) > DEFENSE_SPRINT_DISTANCE_M,
  };
}

const guard: DefenderBehavior = (ctx) => guardLike(ctx, null);

const recover: DefenderBehavior = (ctx) => guardLike(ctx, RECOVER_SPRINT_DISTANCE_M);

const closeout: DefenderBehavior = (ctx) => seekSpot(ctx, guardPoint(ctx.man, CLOSEOUT_CUSHION_M));

const closeoutHard: DefenderBehavior = ({ self, man }) => {
  const dx = man.pos.x - self.pos.x;
  const dz = man.pos.z - self.pos.z;
  const d = Math.hypot(dx, dz);
  if (d === 0) return { x: 0, z: 0, sprint: true };
  return { x: dx / d, z: dz / d, sprint: true };
};

const spot: DefenderBehavior = (ctx) => seekSpot(ctx, ctx.step.spot);

const help: DefenderBehavior = (ctx) => {
  const holder = ballHolder(ctx.game);
  if (
    holder !== null &&
    holder.side === 'offense' &&
    dist(holder.pos, RIM_CENTER) <= HELP_CONTEST_RADIUS_M
  ) {
    const dx = RIM_CENTER.x - holder.pos.x;
    const dz = RIM_CENTER.z - holder.pos.z;
    const d = Math.hypot(dx, dz);
    const gap = Math.min(HELP_CONTEST_GAP_M, d);
    const target =
      d === 0
        ? { x: holder.pos.x, z: holder.pos.z }
        : { x: holder.pos.x + (dx / d) * gap, z: holder.pos.z + (dz / d) * gap };
    // Leave the kick-out lane to the man this helper left open (the read the play grades great).
    return seekSpot(ctx, clearOfLanes(holder, target, ctx.game, ctx.man), true);
  }
  return seekSpot(ctx, ctx.step.spot);
};

function ballHolder(game: GameState): PlayerState | null {
  if (game.ball.kind !== 'held') return null;
  const holderId = game.ball.holderId;
  return game.players.find((p) => p.id === holderId) ?? null;
}

export const DEFENDER_BEHAVIORS: Readonly<Record<DefenderAction, DefenderBehavior>> = {
  guard,
  recover,
  closeout,
  closeoutHard,
  sag: spot,
  help,
  // Generic "go to the scripted spot" behavior until a screen play needs more.
  chaseOver: spot,
  goUnder: spot,
  switch: spot,
  drop: spot,
  hedge: spot,
};

/**
 * One `steer` command per role present in `steps`, from that role's defender behavior. The
 * controlled player is skipped. Throws when a role has no defense or offense player.
 */
export function defenderCommands(
  game: GameState,
  steps: Readonly<Partial<Record<RoleId, DefenderStep>>>,
): PlayerCommand[] {
  const commands: PlayerCommand[] = [];
  for (const role of ROLE_ORDER) {
    const step = steps[role];
    if (step === undefined) continue;
    const self = game.players.find((p) => p.side === 'defense' && p.role === role);
    const man = game.players.find((p) => p.side === 'offense' && p.role === role);
    if (self === undefined) {
      throw new Error(`Court Vision: no defense player with role ${role} in game state`);
    }
    if (man === undefined) {
      throw new Error(`Court Vision: no offense player with role ${role} in game state`);
    }
    if (self.id === game.controlledPlayerId) continue;
    const behavior = DEFENDER_BEHAVIORS[step.action];
    const intent = behavior({ game, self, man, step });
    commands.push({
      type: 'steer',
      playerId: self.id,
      x: intent.x,
      z: intent.z,
      sprint: intent.sprint,
    });
  }
  return commands;
}

/** True inside the key: within half the key width of the rim line, baseline to free-throw line. */
export function isInKey(p: CourtPoint): boolean {
  return (
    Math.abs(p.x - RIM_CENTER.x) <= KEY_WIDTH / 2 && p.z >= BASELINE_Z && p.z <= FREE_THROW_LINE_Z
  );
}
