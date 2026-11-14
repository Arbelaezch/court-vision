// Tutorial prompts: fills {control} tokens from the player's current bindings so a rebind changes the
// text, and builds the per-frame model (prompt, HUD, sim steps) for the tutorial screen. Pure, DOM-free.
import type { TutorialState, TutorialStepResult } from '../ai';
import {
  TUTORIAL_CONTROLS,
  TUTORIAL_FINISHED,
  type CuePrompt,
  type TutorialControl,
} from '../content';
import type { Binding, InputAction } from '../input';
import type { GameEvent, GameState, RoleId } from '../sim';
import { controlDevice, inputLabel } from './controlSettings';
import type { RunHudModel } from './runFrame';
import type { PassTargeting } from './storage/schema';

const UNBOUND = 'an unbound control (set one in Settings)';

const COMPOSITE: Partial<Record<TutorialControl, readonly InputAction[]>> = {
  move: ['moveUp', 'moveLeft', 'moveDown', 'moveRight'],
  passTarget: ['passTarget1', 'passTarget2', 'passTarget3', 'passTarget4'],
};

function label(binding: Binding): string {
  return inputLabel(binding.input, binding.gesture ?? 'single');
}

/** The player-facing name of a tutorial control under the given bindings. */
export function controlLabel(bindings: readonly Binding[], control: TutorialControl): string {
  const subActions = COMPOSITE[control];
  if (subActions !== undefined) {
    const parts = subActions.map((action) => {
      const first = bindings.find(
        (b) => b.action === action && controlDevice(b.input) === 'keyboard',
      );
      return first === undefined ? '?' : label(first);
    });
    return parts.every((p) => p === '?') ? UNBOUND : parts.join('/');
  }
  const own = bindings.filter((b) => b.action === control);
  const keys = own.filter((b) => controlDevice(b.input) === 'keyboard').map(label);
  const pads = own.filter((b) => controlDevice(b.input) === 'gamepad').map(label);
  if (keys.length === 0 && pads.length === 0) return UNBOUND;
  const keyText = keys.join(' or ');
  if (pads.length === 0) return keyText;
  const padText = `(gamepad: ${pads.join(' or ')})`;
  return keys.length === 0 ? padText : `${keyText} ${padText}`;
}

/** Replaces each `{control}` token with its binding label. An unknown token throws. */
export function fillTutorialText(
  text: string,
  bindings: readonly Binding[],
  passTargeting: PassTargeting = 'both',
): string {
  return text.replace(/\{([^{}]*)\}/g, (_match, name: string) => {
    if (!(TUTORIAL_CONTROLS as readonly string[]).includes(name)) {
      throw new Error(`Court Vision: unknown tutorial control "{${name}}"`);
    }
    if (name === 'passAim') return passAimText(bindings, passTargeting);
    return controlLabel(bindings, name as TutorialControl);
  });
}

/** The pass-aiming sentence for the targeting mode, so it names only controls that work. */
function passAimText(bindings: readonly Binding[], mode: PassTargeting): string {
  const keys = controlLabel(bindings, 'passTarget');
  if (mode === 'aim') return 'Aim at your teammate (a player on your team) with the mouse';
  if (mode === 'numbered') return `Pick your teammate (a player on your team) with ${keys}`;
  return `Aim at your teammate (a player on your team) with the mouse, or pick one with ${keys}`;
}

export interface TutorialFrameStep {
  readonly game: GameState;
  readonly events: readonly GameEvent[];
  readonly reset: boolean;
}

export interface TutorialFrame {
  readonly steps: readonly TutorialFrameStep[];
  readonly game: GameState;
  readonly humanRole: RoleId;
  readonly prompt: CuePrompt;
  readonly hud: RunHudModel;
}

export function buildTutorialFrame(
  state: TutorialState,
  steps: readonly TutorialStepResult[],
  bindings: readonly Binding[],
  passTargeting: PassTargeting = 'both',
): TutorialFrame {
  const step = state.steps[state.stepIndex];
  if (step === undefined) throw new Error('Court Vision: the tutorial step is missing');
  const game = state.game;
  const controlled = game.players.find((p) => p.id === game.controlledPlayerId);
  if (controlled === undefined) throw new Error('Court Vision: the controlled player is missing');
  const last = state.stepIndex >= state.steps.length - 1;
  const closing = state.status === 'finished' || (state.status === 'stepDone' && last);
  const fill = (text: string) => fillTutorialText(text, bindings, passTargeting);

  let prompt: CuePrompt;
  if (closing) {
    prompt = { headline: TUTORIAL_FINISHED.headline, reason: TUTORIAL_FINISHED.reason };
  } else {
    const explain = fill(step.explain);
    prompt = {
      headline: fill(step.instruction),
      reason: state.misses > 0 && step.retry !== null ? `${fill(step.retry)} ${explain}` : explain,
    };
  }

  const banner = closing
    ? ({ tone: 'success', text: 'Tutorial complete!' } as const)
    : state.status === 'stepDone'
      ? ({ tone: 'success', text: 'Nice!' } as const)
      : null;

  return {
    steps: steps.map((r) => ({ game: r.state.game, events: r.events, reset: r.reset })),
    game,
    humanRole: controlled.role,
    prompt,
    hud: {
      objective: `Tutorial · Step ${state.stepIndex + 1} of ${state.steps.length}: ${step.title}`,
      stamina: Math.min(1, Math.max(0, controlled.stamina)),
      banner,
    },
  };
}
