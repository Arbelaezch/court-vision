// What the renderer and HUD get each frame: the sim steps just run, the cues visible now, the
// do-this-now prompt and the HUD model. Pure and DOM-free.
import type { RunControllerState, RunControllerStep } from '../ai';
import {
  phaseCues,
  promptForCues,
  type Cue,
  type CuePrompt,
  type CueToggles,
  type PlayScenario,
} from '../content';

export interface RunBanner {
  readonly tone: 'success' | 'neutral';
  readonly text: string;
}

export interface RunHudModel {
  readonly objective: string;
  /** Controlled player's sprint stamina, [0, 1]. */
  readonly stamina: number;
  readonly banner: RunBanner | null;
}

export interface RunFrame {
  readonly steps: readonly RunControllerStep[];
  readonly cues: readonly Cue[];
  readonly prompt: CuePrompt | null;
  readonly hud: RunHudModel;
}

function bannerFor(controller: RunControllerState): RunBanner | null {
  if (controller.status !== 'showingResult') return null;
  const outcome = controller.referee.outcome;
  if (outcome === null) return null;
  switch (outcome.kind) {
    case 'success':
      return { tone: 'success', text: outcome.quality === 'good' ? 'Good run!' : 'Perfect run!' };
    case 'unsuccessful':
      return { tone: 'neutral', text: 'Not quite. Try again.' };
    case 'mistake':
      return null;
  }
}

export function buildRunFrame(
  play: PlayScenario,
  controller: RunControllerState,
  steps: readonly RunControllerStep[],
  cueToggles: CueToggles,
): RunFrame {
  const cues =
    controller.status === 'playing'
      ? phaseCues(play, controller.run.phaseId, controller.mode.cueLevel, cueToggles)
      : [];
  const controlled = controller.game.players.find(
    (p) => p.id === controller.game.controlledPlayerId,
  );
  const stamina = Math.min(1, Math.max(0, controlled?.stamina ?? 0));
  return {
    steps,
    cues,
    prompt: promptForCues(cues),
    hud: { objective: play.concept, stamina, banner: bannerFor(controller) },
  };
}
