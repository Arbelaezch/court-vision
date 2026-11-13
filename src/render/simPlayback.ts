// Plays recorded sim states back at real time using the fixed-step stepper, so the render rate does
// not change what the sim shows. Read-only over the states.

import { SIM_HZ, advanceStepper, createStepper, stepperAlpha } from '../sim';
import { createSimAnimTracker } from './simAnimation';
import type { SimAnimTracker } from './simAnimation';
import type { SimSnapshot } from './simInterpolation';

/** Seconds to hold the final state before the playback restarts. */
export const SIM_PLAYBACK_LOOP_HOLD_S = 1.5;

export interface SimFrame {
  prev: SimSnapshot;
  curr: SimSnapshot;
  alpha: number;
}

export interface SimPlayback {
  advance(dtSec: number): SimFrame;
  readonly tracker: SimAnimTracker;
}

export function createSimPlayback(
  states: readonly SimSnapshot[],
  opts: { speed?: number; loop?: boolean } = {},
): SimPlayback {
  if (states.length < 2) {
    throw new Error('Court Vision: sim playback needs at least two states');
  }
  const speed = opts.speed ?? 1;
  const loop = opts.loop ?? true;
  const last = states.length - 1;
  const holdSteps = Math.round(SIM_PLAYBACK_LOOP_HOLD_S * SIM_HZ);
  const tracker = createSimAnimTracker();
  let stepper = createStepper(speed);
  let observed = 0;

  function advance(dtSec: number): SimFrame {
    advanceStepper(stepper, dtSec * 1000);
    if (loop && stepper.stepsTaken >= last + holdSteps) {
      stepper = createStepper(speed);
      tracker.reset();
      observed = 0;
    }
    const n = Math.min(stepper.stepsTaken, last);
    for (let j = observed + 1; j <= n; j++) {
      tracker.observe(states[j - 1]!, states[j]!);
    }
    observed = Math.max(observed, n);
    return {
      prev: states[Math.max(n - 1, 0)]!,
      curr: states[n]!,
      alpha: n < last ? stepperAlpha(stepper) : 0,
    };
  }

  return { advance, tracker };
}
