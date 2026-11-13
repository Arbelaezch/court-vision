// Headless runner: (seed, input timeline) -> final state. Works in ticks (sim time), so the
// stepper's speed multiplier does not affect it. Same seed and inputs always give the same result.

import { createGame } from './state';
import type {
  DefenseMode,
  GameState,
  MovementSetup,
  PassingSetup,
  PlayerCommand,
  ShootingSetup,
  SimAction,
  SimInput,
} from './state';
import { stepGame } from './step';

export interface SimCommandInput {
  tick: number;
  command: PlayerCommand;
}

export interface HeadlessRunOptions {
  seed: number;
  ticks: number;
  /** Inputs sorted by tick; inputs on the same tick apply in timeline order. */
  inputs: readonly SimInput[];
  shotClockSeconds?: number | null;
  movement: MovementSetup;
  /** Passing numbers; without them pass inputs throw. */
  passing?: PassingSetup;
  /** Shooting numbers; without them shot inputs throw. */
  shooting?: ShootingSetup;
  /** Commands sorted by tick; same-tick commands apply in timeline order. Default []. */
  commands?: readonly SimCommandInput[];
  /** Passed to createGame. Default 'live'. */
  defenseMode?: DefenseMode;
}

function validateTimeline(
  ticks: number,
  inputs: readonly SimInput[],
  commands: readonly SimCommandInput[],
): void {
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
  previousTick = 0;
  commands.forEach((entry, index) => {
    if (!Number.isInteger(entry.tick) || entry.tick < 0 || entry.tick >= ticks) {
      throw new Error(
        `Court Vision: command tick must be an integer in [0, ${ticks}), got ${entry.tick} at index ${index}`,
      );
    }
    if (entry.tick < previousTick) {
      throw new Error(
        `Court Vision: commands must be sorted by tick, got ${entry.tick} after ${previousTick} at index ${index}`,
      );
    }
    previousTick = entry.tick;
  });
}

/** Runs the timeline and returns every state: [0] is the createGame state, [k] is after k steps. */
function runAll({
  seed,
  ticks,
  inputs,
  shotClockSeconds = null,
  movement,
  passing,
  shooting,
  commands = [],
  defenseMode,
}: HeadlessRunOptions): GameState[] {
  validateTimeline(ticks, inputs, commands);

  let state = createGame({ seed, shotClockSeconds, movement, passing, shooting, defenseMode });
  const states: GameState[] = [state];
  let nextInput = 0;
  let nextCommand = 0;
  for (let t = 0; t < ticks; t++) {
    const actions: SimAction[] = [];
    let input = inputs[nextInput];
    while (input !== undefined && input.tick === t) {
      actions.push(input.action);
      nextInput++;
      input = inputs[nextInput];
    }
    const stepCommands: PlayerCommand[] = [];
    let entry = commands[nextCommand];
    while (entry !== undefined && entry.tick === t) {
      stepCommands.push(entry.command);
      nextCommand++;
      entry = commands[nextCommand];
    }
    state = stepGame(state, actions, stepCommands);
    states.push(state);
  }
  return states;
}

export function runHeadless(opts: HeadlessRunOptions): GameState {
  const states = runAll(opts);
  return states[states.length - 1]!;
}

/** Every state: [0] is the createGame state, [k] the state after k steps; length ticks + 1. */
export function recordHeadless(opts: HeadlessRunOptions): GameState[] {
  return runAll(opts);
}
