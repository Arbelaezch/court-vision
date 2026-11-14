// Audio layer: turns sim steps (events plus state changes) into sound cues. Pure: no audio calls.

import { FIXED_DT, SIM_HZ } from '../sim';
import type { GameEvent, GameState, PassType } from '../sim';
import { ANIM_CLIP_PERIOD_S, MOVING_SPEED_MPS } from '../render/animation';
import { SHOT_MIN_FLIGHT_TICKS, shotArcFromStep } from '../render/simInterpolation';
import { soundForEvent, type SoundId } from './eventSounds';

export interface SoundStep {
  readonly game: GameState;
  readonly events: readonly GameEvent[];
  readonly reset: boolean;
}

export interface SoundCue {
  readonly sound: SoundId;
  readonly delayS: number;
}

/** Time between footsteps while the controlled player sprints, s. */
export const FOOTSTEP_INTERVAL_S = 0.3;
export const FOOTSTEP_INTERVAL_TICKS = Math.max(1, Math.round(FOOTSTEP_INTERVAL_S * SIM_HZ));

export interface SoundDirector {
  observe(step: SoundStep): SoundCue[];
  reset(): void;
}

// A hand-off is a short exchange; its catch is what you hear, so the release is silent.
function passReleaseSound(passType: PassType): SoundId | null {
  switch (passType) {
    case 'chestPass':
      return 'passChest';
    case 'bouncePass':
      return 'passBounce';
    case 'lob':
      return 'passLob';
    case 'handOff':
      return null;
    default: {
      const unhandled: never = passType;
      throw new Error(`Court Vision: unknown pass type ${JSON.stringify(unhandled)}`);
    }
  }
}

// Matches the bounce phase of heldBallPosition in src/render/simInterpolation.ts.
function bounceIndex(tick: number): number {
  return Math.floor((tick * FIXED_DT) / ANIM_CLIP_PERIOD_S.dribble + 0.5);
}

function playerKey(game: GameState): string {
  return game.players.map((p) => p.id).join(',');
}

export function createSoundDirector(): SoundDirector {
  let prev: GameState | null = null;
  let footstepCounter = 0;

  function observe(step: SoundStep): SoundCue[] {
    const curr = step.game;
    const cues: SoundCue[] = [];

    const valid =
      prev !== null && !step.reset && curr.tick > prev.tick && playerKey(prev) === playerKey(curr);

    for (const event of step.events) {
      const sound = soundForEvent(event);
      if (sound !== null) cues.push({ sound, delayS: 0 });
      if (event.type === 'shotResolved' && event.blockerId === null && prev !== null && valid) {
        const flight = shotArcFromStep(prev, curr, event)?.flightTicks ?? SHOT_MIN_FLIGHT_TICKS;
        cues.push({ sound: event.made ? 'swish' : 'rimHit', delayS: flight / SIM_HZ });
      }
    }

    if (prev === null || !valid) {
      prev = curr;
      footstepCounter = 0;
      return cues;
    }

    if (prev.ball.kind === 'held' && curr.ball.kind === 'inFlight') {
      const sound = passReleaseSound(curr.ball.passType);
      if (sound !== null) cues.push({ sound, delayS: 0 });
    }

    if (curr.ball.kind === 'held' && bounceIndex(curr.tick) > bounceIndex(prev.tick)) {
      cues.push({ sound: 'dribble', delayS: 0 });
    }

    const me = curr.players.find((p) => p.id === curr.controlledPlayerId);
    if (me !== undefined && me.sprinting && Math.hypot(me.vel.x, me.vel.z) > MOVING_SPEED_MPS) {
      if (footstepCounter === 0) cues.push({ sound: 'footstep', delayS: 0 });
      footstepCounter = (footstepCounter + 1) % FOOTSTEP_INTERVAL_TICKS;
    } else {
      footstepCounter = 0;
    }

    prev = curr;
    return cues;
  }

  return {
    observe,
    reset: () => {
      prev = null;
      footstepCounter = 0;
    },
  };
}
