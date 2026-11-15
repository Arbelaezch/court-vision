// Preview-only coverage loop for Play Select (g9). Runs one play against each of its coverages in
// order with live defenders, driven by a bot, and wraps back to the first coverage. When the run
// controller would reset (after the result hold or a whistle) the loop starts the next coverage
// instead; a step cap guards against a stalled run.
//
// Pure and deterministic: no timers, no Math.random, no wall clock. It never records attempts: the
// `attempt` a step reports is only used to show the run ended, and nothing stores it.
import type { ModeConfig, PlayScenario } from '../content';
import { SIM_HZ } from '../sim';
import type { PlayBot } from './playBots';
import {
  startRunController,
  stepRunController,
  type RunControllerOptions,
  type RunControllerState,
  type RunControllerStep,
} from './runController';

/** The most sim steps one coverage may run before the loop moves on (stalled-run guard). */
export const PREVIEW_MAX_COVERAGE_STEPS = Math.round(30 * SIM_HZ);

export interface PreviewLoopState {
  readonly playId: string;
  readonly coverageIndex: number;
  readonly stepsInCoverage: number;
  readonly controller: RunControllerState;
}

export interface PreviewLoopStep {
  loop: PreviewLoopState;
  step: RunControllerStep;
}

function coverageAt(play: PlayScenario, index: number) {
  const coverage = play.coverages[index];
  if (coverage === undefined) {
    throw new Error(`Court Vision: play ${play.id} has no coverage at index ${index}`);
  }
  return coverage;
}

/** Starts the loop on the play's first coverage. Needs a live-defense mode. */
export function startPreviewLoop(
  play: PlayScenario,
  mode: ModeConfig,
  options: Omit<RunControllerOptions, 'coverageId'>,
): PreviewLoopState {
  if (mode.defense !== 'live') {
    throw new Error(`Court Vision: play preview needs a live-defense mode, got ${mode.id}`);
  }
  const controller = startRunController(play, mode, {
    ...options,
    coverageId: coverageAt(play, 0).id,
  });
  return { playId: play.id, coverageIndex: 0, stepsInCoverage: 0, controller };
}

/** Advances the loop by one sim step, moving to the next coverage when the run would reset. */
export function stepPreviewLoop(
  play: PlayScenario,
  loop: PreviewLoopState,
  bot: PlayBot,
): PreviewLoopStep {
  if (play.id !== loop.playId) {
    throw new Error(`Court Vision: preview loop is for play ${loop.playId}, got play ${play.id}`);
  }
  const actions = loop.controller.status === 'playing' ? bot(loop.controller) : [];
  const step = stepRunController(play, loop.controller, actions);
  if (step.reset || loop.stepsInCoverage + 1 >= PREVIEW_MAX_COVERAGE_STEPS) {
    const next = (loop.coverageIndex + 1) % play.coverages.length;
    const controller = startRunController(play, loop.controller.mode, {
      ...loop.controller.options,
      coverageId: coverageAt(play, next).id,
    });
    return {
      loop: { playId: loop.playId, coverageIndex: next, stepsInCoverage: 0, controller },
      step: { controller, events: [], attempt: null, reset: true },
    };
  }
  return {
    loop: {
      playId: loop.playId,
      coverageIndex: loop.coverageIndex,
      stepsInCoverage: loop.stepsInCoverage + 1,
      controller: step.controller,
    },
    step,
  };
}

/** The plain-language name of the coverage the loop is currently running. */
export function previewCoverageName(play: PlayScenario, loop: PreviewLoopState): string {
  return coverageAt(play, loop.coverageIndex).name;
}
