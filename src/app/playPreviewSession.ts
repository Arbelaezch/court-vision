// Play Select preview session (g9): the fixed-step clock and draw-model builder behind the animated
// preview. It runs the bot-driven coverage loop in a live-defense mode and never touches the save
// store, so preview runs never count as attempts. Pure and DOM-free.
import {
  createCorrectReadBot,
  previewCoverageName,
  startPreviewLoop,
  stepPreviewLoop,
  type PlayBot,
  type PreviewLoopState,
} from '../ai';
import type { ModeConfig, PlayScenario } from '../content';
import {
  advanceStepper,
  createStepper,
  type GameEvent,
  type GameState,
  type RoleId,
  type StepperState,
} from '../sim';
import type { AppContent } from './appFlow';

export const PREVIEW_SEED = 1;

export interface PreviewDrawStep {
  readonly game: GameState;
  readonly events: readonly GameEvent[];
  readonly reset: boolean;
}

export interface PreviewDrawFrame {
  readonly playId: string;
  readonly coverageLabel: string;
  readonly coverageIndex: number;
  readonly coverageCount: number;
  readonly game: GameState;
  readonly humanRole: RoleId;
  readonly steps: readonly PreviewDrawStep[];
}

export interface PlayPreviewSession {
  select(playId: string): void;
  current(): string | null;
  frame(frameDeltaMs: number): PreviewDrawFrame | null;
  stop(): void;
}

export interface PlayPreviewSessionOptions {
  content: AppContent;
  reducedMotion: () => boolean;
}

interface Active {
  readonly play: PlayScenario;
  readonly bot: PlayBot;
  readonly stepper: StepperState;
  loop: PreviewLoopState;
  pending: PreviewDrawStep[];
}

export function createPlayPreviewSession(opts: PlayPreviewSessionOptions): PlayPreviewSession {
  const mode: ModeConfig | undefined = opts.content.modes['scrimmage'];
  if (mode === undefined || mode.defense !== 'live') {
    throw new Error('Court Vision: play preview needs the scrimmage (live-defense) mode');
  }
  let active: Active | null = null;

  return {
    select(playId) {
      const play = opts.content.plays[playId];
      if (play === undefined) throw new Error(`Court Vision: unknown play ${playId}`);
      if (active !== null && active.play.id === playId) return;
      const loop = startPreviewLoop(play, mode, {
        seed: PREVIEW_SEED,
        movement: opts.content.movement,
        passing: opts.content.passing,
        shooting: opts.content.shooting,
      });
      active = {
        play,
        bot: createCorrectReadBot(play),
        stepper: createStepper(1),
        loop,
        pending: [{ game: loop.controller.game, events: [], reset: true }],
      };
    },
    current: () => (active === null ? null : active.play.id),
    frame(frameDeltaMs) {
      const a = active;
      if (a === null) return null;
      const steps: PreviewDrawStep[] = a.pending;
      a.pending = [];
      if (!opts.reducedMotion()) {
        const n = advanceStepper(a.stepper, frameDeltaMs);
        for (let i = 0; i < n; i++) {
          const result = stepPreviewLoop(a.play, a.loop, a.bot);
          a.loop = result.loop;
          steps.push({
            game: result.step.controller.game,
            events: result.step.events,
            reset: result.step.reset,
          });
        }
      }
      return {
        playId: a.play.id,
        coverageLabel: previewCoverageName(a.play, a.loop),
        coverageIndex: a.loop.coverageIndex,
        coverageCount: a.play.coverages.length,
        game: a.loop.controller.game,
        humanRole: a.loop.controller.run.humanRole,
        steps,
      };
    },
    stop() {
      active = null;
    },
  };
}
