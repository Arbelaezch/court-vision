// Pure render-side interpolation of sim snapshots: player poses, the held ball, pass arcs from the
// sim and the render-only shot arc. Reads plain data and never writes to a snapshot.
import {
  FIXED_DT,
  RIM_CENTER,
  RIM_HEIGHT,
  shotFlightTicks,
  shotReleaseHeight,
  shotTargetPoint,
} from '../sim';
import type { GameEvent, GameState, ShotType, TeamSide, Vec3 } from '../sim';
import { ANIM_CLIP_PERIOD_S, MOVING_SPEED_MPS } from './animation';
import type { AnimState } from './animation';
import type { CharacterPose } from './characters';

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type SimSnapshot = DeepReadonly<GameState>;
type SimPlayer = SimSnapshot['players'][number];
export type ShotResolvedEvent = DeepReadonly<Extract<GameEvent, { type: 'shotResolved' }>>;

/** Ball radius, m. */
export const BALL_RADIUS_M = 0.12;
/** Distance the held ball sits in front of the holder, m. */
export const BALL_HOLD_FORWARD_M = 0.4;
/** Lowest height of the dribbled ball, m. */
export const BALL_DRIBBLE_LOW_M = 0.15;
/** Highest height of the dribbled ball, m. */
export const BALL_DRIBBLE_HIGH_M = 0.9;
/** Speed range over which the hold offset eases to the velocity-facing side, m/s. */
const HOLD_BLEND_SPEED_MPS = 1;
/** Height of a carried (not dribbled) ball, m. */
export const BALL_CARRY_HEIGHT_M = 1.1;
/** Rise of a jump shot or floater above its higher endpoint, m. */
export const SHOT_ARC_RISE_M = 1.2;
/** Rise of a layup above its higher endpoint, m. */
export const LAYUP_ARC_RISE_M = 0.4;
export { SHOT_MIN_FLIGHT_TICKS, SHOT_MISS_OFFSET_M, SHOT_SPEED_MPS } from '../sim';
/** Share of a shot's flight over which the ball eases from the hand onto the arc. */
export const SHOT_RELEASE_BLEND_FRACTION = 0.5;
/** Gravity for the ball falling after a shot, m/s^2. */
export const GRAVITY_MPS2 = 9.81;

export interface ShotArc {
  shooterId: number;
  from: Vec3;
  to: Vec3;
  /** Ball position in the shooter's hand on the tick before release; null when the shooter was not the holder. */
  hand: Vec3 | null;
  /** Peak height of the parabola, m. */
  apexM: number;
  startTick: number;
  flightTicks: number;
  made: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolatePlayers(
  prev: SimSnapshot,
  curr: SimSnapshot,
  alpha: number,
  animFor: (player: SimPlayer) => AnimState,
): CharacterPose[] {
  return curr.players.map((p) => {
    const before = prev.players.find((q) => q.id === p.id) ?? p;
    return {
      id: p.id,
      pos: { x: lerp(before.pos.x, p.pos.x, alpha), z: lerp(before.pos.z, p.pos.z, alpha) },
      vel: { x: lerp(before.vel.x, p.vel.x, alpha), z: lerp(before.vel.z, p.vel.z, alpha) },
      anim: animFor(p),
    };
  });
}

/** Same rule as the character layer: face the velocity when moving, else the default side. */
export function facingYaw(pose: Pick<CharacterPose, 'vel'>, side: TeamSide): number {
  const speed = Math.hypot(pose.vel.x, pose.vel.z);
  if (speed > MOVING_SPEED_MPS) return Math.atan2(pose.vel.x, pose.vel.z);
  return side === 'offense' ? Math.PI : 0;
}

export function heldBallPosition(holder: CharacterPose, side: TeamSide, simSeconds: number): Vec3 {
  // Ease the hold offset from the default-facing side to the velocity-facing side as the holder
  // gets going, so the ball does not swing 0.4 m in one frame when the facing rule flips.
  const speed = Math.hypot(holder.vel.x, holder.vel.z);
  const w = Math.min(1, Math.max(0, (speed - MOVING_SPEED_MPS) / HOLD_BLEND_SPEED_MPS));
  const eased = w * w * (3 - 2 * w);
  const defaultYaw = side === 'offense' ? Math.PI : 0;
  const fx =
    Math.sin(defaultYaw) * (1 - eased) + (speed > 1e-9 ? (holder.vel.x / speed) * eased : 0);
  const fz =
    Math.cos(defaultYaw) * (1 - eased) + (speed > 1e-9 ? (holder.vel.z / speed) * eased : 0);
  const y =
    // Every animation a ball holder can have (including catch, screen and the release clips) keeps
    // the bounce phase, so the ball height never pops when the holder's anim changes.
    holder.anim !== 'idle' && holder.anim !== 'run' && holder.anim !== 'sprint'
      ? BALL_DRIBBLE_LOW_M +
        (BALL_DRIBBLE_HIGH_M - BALL_DRIBBLE_LOW_M) *
          Math.abs(Math.cos((Math.PI * simSeconds) / ANIM_CLIP_PERIOD_S.dribble))
      : BALL_CARRY_HEIGHT_M;
  return {
    x: holder.pos.x + fx * BALL_HOLD_FORWARD_M,
    y,
    z: holder.pos.z + fz * BALL_HOLD_FORWARD_M,
  };
}

function isLayupLike(type: ShotType): boolean {
  return type === 'layup';
}

export function shotArcFromStep(
  prev: SimSnapshot,
  curr: SimSnapshot,
  event: ShotResolvedEvent,
): ShotArc | null {
  if (event.blockerId !== null) return null;
  const shooter =
    prev.players.find((p) => p.id === event.shooterId) ??
    curr.players.find((p) => p.id === event.shooterId);
  if (!shooter) return null;
  const releaseY = curr.shooting
    ? shotReleaseHeight(event.shotType, curr.shooting.tuning)
    : BALL_CARRY_HEIGHT_M;
  const from: Vec3 = { x: shooter.pos.x, y: releaseY, z: shooter.pos.z };
  const target = shotTargetPoint(shooter.pos, event.made);
  const to: Vec3 = { x: target.x, y: RIM_HEIGHT, z: target.z };
  const rise = isLayupLike(event.shotType) ? LAYUP_ARC_RISE_M : SHOT_ARC_RISE_M;
  const hand =
    prev.ball.kind === 'held' && prev.ball.holderId === event.shooterId
      ? // Every ball holder uses the dribble band, so this is the last held frame the live view drew.
        heldBallPosition(
          { id: shooter.id, pos: shooter.pos, vel: shooter.vel, anim: 'dribble' },
          shooter.side,
          prev.tick * FIXED_DT,
        )
      : null;
  return {
    shooterId: event.shooterId,
    from,
    to,
    hand,
    apexM: Math.max(from.y, to.y) + rise,
    startTick: prev.tick,
    flightTicks: shotFlightTicks(event.shotType, shooter.pos, event.made),
    made: event.made,
  };
}

/** Ball position along a shot arc at a fractional sim tick, then falling to the floor. */
export function shotArcPosition(arc: ShotArc, simTick: number): Vec3 {
  const u = Math.max(0, (simTick - arc.startTick) / arc.flightTicks);
  if (u <= 1) {
    return {
      x: lerp(arc.from.x, arc.to.x, u),
      y:
        lerp(arc.from.y, arc.to.y, u) + 4 * (arc.apexM - (arc.from.y + arc.to.y) / 2) * u * (1 - u),
      z: lerp(arc.from.z, arc.to.z, u),
    };
  }
  const t = (simTick - (arc.startTick + arc.flightTicks)) * FIXED_DT;
  return {
    x: arc.to.x,
    y: Math.max(BALL_RADIUS_M, arc.to.y - 0.5 * GRAVITY_MPS2 * t * t),
    z: arc.to.z,
  };
}

/**
 * Ball position for a shot: the arc, with the ball easing from the shooter's hand onto it over the
 * first part of the flight so it does not jump from the hand to the release height.
 */
export function shotBallPosition(arc: ShotArc, simTick: number): Vec3 {
  const onArc = shotArcPosition(arc, simTick);
  if (!arc.hand) return onArc;
  const blendTicks = Math.max(1, Math.round(arc.flightTicks * SHOT_RELEASE_BLEND_FRACTION));
  const x = Math.min(1, Math.max(0, (simTick - arc.startTick) / blendTicks));
  const w = 1 - x * x * (3 - 2 * x);
  return {
    x: onArc.x + (arc.hand.x - arc.from.x) * w,
    y: onArc.y + (arc.hand.y - arc.from.y) * w,
    z: onArc.z + (arc.hand.z - arc.from.z) * w,
  };
}

/**
 * `arcTick` overrides the sim tick the shot arc is evaluated at (the live view keeps the arc playing
 * while the controller repeats one frame).
 */
export function ballRenderPosition(
  prev: SimSnapshot,
  curr: SimSnapshot,
  alpha: number,
  poses: readonly CharacterPose[],
  shotArc: ShotArc | null,
  arcTick?: number,
): Vec3 {
  const simTick = prev.tick + alpha;
  const simSeconds = simTick * FIXED_DT;
  const heldAt = (holderId: number): Vec3 | null => {
    const pose = poses.find((p) => p.id === holderId);
    const player = curr.players.find((p) => p.id === holderId);
    if (!pose || !player) return null;
    return heldBallPosition(pose, player.side, simSeconds);
  };
  const lerp3 = (a: Vec3, b: Vec3): Vec3 => ({
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    z: lerp(a.z, b.z, alpha),
  });
  const rest: Vec3 = { x: RIM_CENTER.x, y: BALL_RADIUS_M, z: RIM_CENTER.z };

  const ball = curr.ball;
  switch (ball.kind) {
    case 'inFlight': {
      const before = prev.ball;
      if (before.kind === 'held') {
        // Release step: blend from where the hand held the ball so it does not snap overhead.
        const held = heldAt(before.holderId);
        return lerp3(held ?? ball.origin, ball.pos);
      }
      const from =
        before.kind === 'inFlight' &&
        before.fromId === ball.fromId &&
        before.targetId === ball.targetId
          ? before.pos
          : ball.origin;
      return lerp3(from, ball.pos);
    }
    case 'held': {
      const held = heldAt(ball.holderId);
      if (!held) return rest;
      if (prev.ball.kind === 'inFlight') return lerp3(prev.ball.pos, held);
      return held;
    }
    case 'dead': {
      if (shotArc && shotArc.shooterId === ball.shooterId) {
        const onArc = shotBallPosition(shotArc, arcTick ?? simTick);
        if (prev.ball.kind === 'held') {
          // Release step: blend from the held position to the arc.
          const held = heldAt(prev.ball.holderId);
          if (held) return lerp3(held, onArc);
        }
        return onArc;
      }
      return rest;
    }
  }
}
