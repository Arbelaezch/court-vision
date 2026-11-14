// Run controller: one run of a play under a mode config, from setup to outcome and back to setup.
// It composes the play-run engine (startPracticeRun / stepPracticeRun) with the run referee
// (startReferee / stepReferee) and adds the run lifecycle:
// - a mistake (whistle) returns the end-of-run frame and its events; the next step rebuilds the run
//   at the setup positions without simulating a tick (instant reset, spec 8.2);
// - a success or an unsuccessful run holds the final frame for RESULT_HOLD_STEPS sim steps (the
//   result banner), then resets the same way. The hold is counted in sim steps, so pausing or
//   hiding the tab freezes it too (decision "Hidden tab behavior");
// - restart and quit end the run without an outcome.
//
// Attempts (g12, decision "Does an unsuccessful (Bad look) run count as an attempt?"): a step
// reports a terminal `attempt` exactly once per run, on the step the referee's outcome is set. A
// mistake and an unsuccessful run are failed attempts; a success is a successful one. Quit and
// restart never produce an attempt, so abandoned runs are never counted. The controller never
// touches storage: the app layer records the attempt.
//
// Run `n` (0-based runIndex) uses seed `(options.seed + n) >>> 0`; every reset or restart moves to
// the next run.
//
// Pure and deterministic: no timers, no Math.random, no wall clock, no mutation of inputs.
import type { ModeConfig, ModeId, PlayScenario } from '../content';
import {
  SIM_HZ,
  type GameEvent,
  type GameState,
  type MovementSetup,
  type PassingSetup,
  type RoleId,
  type ShootingSetup,
  type SimAction,
} from '../sim';
import { startPracticeRun, stepPracticeRun, type PlayRunState } from './playRun';
import { startReferee, stepReferee, type RefereeState, type RunOutcome } from './referee';

/** How long the result banner holds the final frame after a success or unsuccessful run, s. */
export const RESULT_HOLD_SECONDS = 1.5;
/** RESULT_HOLD_SECONDS in sim steps. */
export const RESULT_HOLD_STEPS = Math.round(RESULT_HOLD_SECONDS * SIM_HZ);

export interface RunControllerOptions {
  seed: number;
  movement: MovementSetup;
  passing: PassingSetup;
  shooting?: ShootingSetup;
  /** Default: play.playableRoles[0]. */
  humanRole?: RoleId;
  /** Practice rules default to play.practiceCoverage; Scrimmage rules require it. */
  coverageId?: string;
}

export type RunControllerStatus = 'playing' | 'resetPending' | 'showingResult' | 'quit';

export interface RunAttempt {
  playId: string;
  modeId: ModeId;
  success: boolean;
  outcome: RunOutcome;
}

export interface RunControllerState {
  playId: string;
  mode: ModeConfig;
  options: RunControllerOptions;
  runIndex: number;
  game: GameState;
  run: PlayRunState;
  referee: RefereeState;
  status: RunControllerStatus;
  /** Steps left in the result hold (0 unless showingResult). */
  resultStepsLeft: number;
}

export interface RunControllerStep {
  controller: RunControllerState;
  events: GameEvent[];
  /** The run's terminal outcome, set on exactly one step per run; null otherwise. */
  attempt: RunAttempt | null;
  /** True when this step rebuilt the run at the setup positions (no sim tick ran). */
  reset: boolean;
}

function buildRun(
  play: PlayScenario,
  mode: ModeConfig,
  options: RunControllerOptions,
  runIndex: number,
): RunControllerState {
  const seed = (options.seed + runIndex) >>> 0;
  const coverageId =
    mode.rules === 'practice' ? (options.coverageId ?? play.practiceCoverage) : options.coverageId;
  const liveCoverageId = mode.defense === 'live' ? coverageId : undefined;
  const { game, run } = startPracticeRun(play, {
    seed,
    movement: options.movement,
    passing: options.passing,
    ...(options.shooting === undefined ? {} : { shooting: options.shooting }),
    ...(options.humanRole === undefined ? {} : { humanRole: options.humanRole }),
    shotClockSeconds: mode.shotClockSeconds,
    ...(liveCoverageId === undefined ? {} : { liveCoverageId }),
  });
  const referee = startReferee(play, {
    mode: mode.rules,
    humanRole: run.humanRole,
    ...(coverageId === undefined ? {} : { coverageId }),
  });
  return {
    playId: play.id,
    mode,
    options,
    runIndex,
    game,
    run,
    referee,
    status: 'playing',
    resultStepsLeft: 0,
  };
}

/** Starts the first run (runIndex 0) of `play` under `mode`. */
export function startRunController(
  play: PlayScenario,
  mode: ModeConfig,
  options: RunControllerOptions,
): RunControllerState {
  return buildRun(play, mode, options, 0);
}

function nextRun(play: PlayScenario, controller: RunControllerState): RunControllerStep {
  return {
    controller: buildRun(play, controller.mode, controller.options, controller.runIndex + 1),
    events: [],
    attempt: null,
    reset: true,
  };
}

/**
 * Advances the controller by one sim step. While playing, steps the run and the referee; while a
 * reset is pending, rebuilds the run; while showing a result, counts down the hold. Pure.
 */
export function stepRunController(
  play: PlayScenario,
  controller: RunControllerState,
  actions: readonly SimAction[],
): RunControllerStep {
  if (play.id !== controller.playId) {
    throw new Error(
      `Court Vision: run controller is for play ${controller.playId}, got play ${play.id}`,
    );
  }
  switch (controller.status) {
    case 'quit':
      throw new Error('Court Vision: run controller has quit');
    case 'resetPending':
      return nextRun(play, controller);
    case 'showingResult': {
      const left = controller.resultStepsLeft - 1;
      if (left > 0) {
        return {
          controller: { ...controller, resultStepsLeft: left },
          events: [],
          attempt: null,
          reset: false,
        };
      }
      return nextRun(play, controller);
    }
    case 'playing':
      break;
    default: {
      const unreachable: never = controller.status;
      throw new Error(`Court Vision: unknown run controller status ${String(unreachable)}`);
    }
  }

  const { game, run, referee } = controller;
  const next = stepPracticeRun(play, run, game, actions);
  const ref = stepReferee(play, referee, {
    before: game,
    phaseId: run.phaseId,
    actions,
    after: next.game,
  });
  const events = [...next.game.events, ...ref.events];
  const outcome = ref.referee.outcome;
  if (outcome === null) {
    return {
      controller: { ...controller, game: next.game, run: next.run, referee: ref.referee },
      events,
      attempt: null,
      reset: false,
    };
  }
  const resets = outcome.kind === 'mistake' || ref.resetRequested;
  return {
    controller: {
      ...controller,
      game: next.game,
      run: next.run,
      referee: ref.referee,
      status: resets ? 'resetPending' : 'showingResult',
      resultStepsLeft: resets ? 0 : RESULT_HOLD_STEPS,
    },
    events,
    attempt: {
      playId: controller.playId,
      modeId: controller.mode.id,
      success: outcome.kind === 'success',
      outcome,
    },
    reset: false,
  };
}

/** Abandons the current run and starts the next one at setup. Never yields an attempt. */
export function restartRunController(
  play: PlayScenario,
  controller: RunControllerState,
): RunControllerState {
  if (controller.status === 'quit') {
    throw new Error('Court Vision: run controller has quit');
  }
  if (play.id !== controller.playId) {
    throw new Error(
      `Court Vision: run controller is for play ${controller.playId}, got play ${play.id}`,
    );
  }
  return buildRun(play, controller.mode, controller.options, controller.runIndex + 1);
}

/** Abandons the run for good: later steps and restarts throw. Never yields an attempt. */
export function quitRunController(controller: RunControllerState): RunControllerState {
  return { ...controller, status: 'quit' };
}
