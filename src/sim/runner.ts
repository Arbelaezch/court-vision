// Headless runner: (seed, input timeline) -> final state. Works in ticks (sim time), so the
// stepper's speed multiplier does not affect it. Same seed and inputs always give the same result.

import { createGame } from './state';
import type { GameState, MovementSetup, PassingSetup, SimAction, SimInput } from './state';
import { stepGame } from './step';

export interface HeadlessRunOptions {
  seed: number;
  ticks: number;
  /** Inputs sorted by tick; inputs on the same tick apply in timeline order. */
  inputs: readonly SimInput[];
  shotClockSeconds?: number | null;
  movement: MovementSetup;
  /** Passing numbers; without them pass inputs throw. */
  passing?: PassingSetup;
}

function validateTimeline(ticks: number, inputs: readonly SimInput[]): void {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error(`Court Vision: ticks must be a non-negative integer, got ${ticks}`);
  }
  let previousTick = 0;
  inputs.forEach((input, index) => {
    if (!Number.isInteger(input.tick) || input.tick < 0 || input.tick >= ticks) {
      throw new Error(
        `Court Vision: input tick must be an integer in [0, ${ticks}), got ${input.tick} at index ${index}`,
      );
    }
    if (input.tick < previousTick) {
      throw new Error(
        `Court Vision: inputs must be sorted by tick, got ${input.tick} after ${previousTick} at index ${index}`,
      );
    }
    previousTick = input.tick;
  });
}

export function runHeadless({
  seed,
  ticks,
  inputs,
  shotClockSeconds = null,
  movement,
  passing,
}: HeadlessRunOptions): GameState {
  validateTimeline(ticks, inputs);

  let state = createGame({ seed, shotClockSeconds, movement, passing });
  let nextInput = 0;
  for (let t = 0; t < ticks; t++) {
    const actions: SimAction[] = [];
    let input = inputs[nextInput];
    while (input !== undefined && input.tick === t) {
      actions.push(input.action);
      nextInput++;
      input = inputs[nextInput];
    }
    state = stepGame(state, actions);
  }
  return state;
}
