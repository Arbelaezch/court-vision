// Maps sim steps to character animation states. The tracker owns its own timers (in sim seconds)
// and only reads snapshots.
import { FIXED_DT } from '../sim';
import type { GameEvent } from '../sim';
import { ANIM_CLIP_PERIOD_S, MOVING_SPEED_MPS } from './animation';
import type { AnimState } from './animation';
import { shotArcFromStep } from './simInterpolation';
import type { DeepReadonly, ShotArc, SimSnapshot } from './simInterpolation';

type OneShot = 'pass' | 'catch' | 'shoot' | 'layup' | 'screen';

/** How long each one-shot animation holds, sim seconds. */
export const ANIM_ONE_SHOT_S: Record<OneShot, number> = {
  pass: ANIM_CLIP_PERIOD_S.pass,
  catch: ANIM_CLIP_PERIOD_S.catch,
  shoot: ANIM_CLIP_PERIOD_S.shoot,
  layup: ANIM_CLIP_PERIOD_S.layup,
  screen: ANIM_CLIP_PERIOD_S.screen,
};

export interface SimAnimTracker {
  /** Call once per sim step, in order. */
  observe(prev: SimSnapshot, curr: SimSnapshot, extraEvents?: readonly GameEvent[]): void;
  animFor(player: DeepReadonly<SimSnapshot['players'][number]>, curr: SimSnapshot): AnimState;
  shotArc(): ShotArc | null;
  reset(): void;
}

interface Timer {
  state: OneShot;
  remainingS: number;
}

export function createSimAnimTracker(): SimAnimTracker {
  const timers = new Map<number, Timer>();
  let arc: ShotArc | null = null;

  function start(id: number, state: OneShot): void {
    timers.set(id, { state, remainingS: ANIM_ONE_SHOT_S[state] });
  }

  function observe(
    prev: SimSnapshot,
    curr: SimSnapshot,
    extraEvents: readonly GameEvent[] = [],
  ): void {
    for (const [id, timer] of timers) {
      timer.remainingS -= FIXED_DT;
      if (timer.remainingS <= 0) timers.delete(id);
    }

    if (prev.ball.kind === 'held' && curr.ball.kind === 'inFlight') {
      start(curr.ball.fromId, 'pass');
    } else if (prev.ball.kind === 'inFlight' && curr.ball.kind === 'held') {
      start(curr.ball.holderId, 'catch');
    }

    for (const event of curr.events) {
      if (event.type === 'shotResolved') {
        start(event.shooterId, event.shotType === 'layup' || event.shotType === 'floater' ? 'layup' : 'shoot');
        arc = shotArcFromStep(prev, curr, event);
      } else if (event.type === 'screenSet') {
        start(event.screenerId, 'screen');
      }
    }
    for (const event of extraEvents) {
      if (event.type === 'screenSet') start(event.screenerId, 'screen');
    }

    if (curr.ball.kind !== 'dead') arc = null;
  }

  function animFor(
    player: DeepReadonly<SimSnapshot['players'][number]>,
    curr: SimSnapshot,
  ): AnimState {
    const timer = timers.get(player.id);
    if (timer) return timer.state;
    if (curr.ball.kind === 'held' && curr.ball.holderId === player.id) return 'dribble';
    const moving = Math.hypot(player.vel.x, player.vel.z) > MOVING_SPEED_MPS;
    if (moving) return player.sprinting ? 'sprint' : 'run';
    return 'idle';
  }

  return {
    observe,
    animFor,
    shotArc: () => arc,
    reset(): void {
      timers.clear();
      arc = null;
    },
  };
}
