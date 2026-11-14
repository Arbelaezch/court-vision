// App layer: a run session ties the run controller, the run clock and the save store together.
// It is the only writer of play progress. Counters change only on a run's terminal outcome (g12, the
// unsuccessful-run decision: a mistake and an unsuccessful run are failed attempts, a success is a
// successful one). Quit and restart through this session leave them unchanged.
import {
  quitRunController,
  restartRunController,
  startRunController,
  stepRunController,
  type RunControllerOptions,
  type RunControllerState,
  type RunControllerStep,
} from '../ai';
import type { ModeConfig, PlayScenario } from '../content';
import type { SimAction } from '../sim';
import { recordRunAttempt, type SaveStore } from './storage';
import { createRunClock, type PauseReason, type RunClock } from './runClock';

export interface RunSessionOptions extends RunControllerOptions {
  store: SaveStore;
  onPause?: (reason: PauseReason) => void;
}

export interface RunSession {
  readonly clock: RunClock;
  readonly mode: ModeConfig;
  state(): RunControllerState;
  step(actions: readonly SimAction[]): RunControllerStep;
  frame(
    frameDeltaMs: number,
    actionsFor: (state: RunControllerState) => readonly SimAction[],
  ): RunControllerStep[];
  restart(): void;
  quit(): void;
}

export function createRunSession(
  play: PlayScenario,
  mode: ModeConfig,
  options: RunSessionOptions,
): RunSession {
  const { store, onPause, ...rest } = options;
  const clock = createRunClock({
    speed: mode.speedMultiplier,
    ...(onPause ? { onPause } : {}),
  });
  let controller = startRunController(play, mode, rest);

  function step(actions: readonly SimAction[]): RunControllerStep {
    const result = stepRunController(play, controller, actions);
    controller = result.controller;
    if (result.attempt !== null) {
      recordRunAttempt(store, {
        playId: result.attempt.playId,
        modeId: result.attempt.modeId,
        success: result.attempt.success,
      });
    }
    return result;
  }

  return {
    clock,
    mode,
    state: () => controller,
    step,
    frame(frameDeltaMs, actionsFor) {
      const n = clock.advance(frameDeltaMs);
      const steps: RunControllerStep[] = [];
      for (let i = 0; i < n; i++) steps.push(step(actionsFor(controller)));
      return steps;
    },
    restart() {
      controller = restartRunController(play, controller);
    },
    quit() {
      controller = quitRunController(controller);
    },
  };
}
