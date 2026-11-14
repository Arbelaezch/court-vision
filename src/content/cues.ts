// Which cues show for a phase. Mode cue level is the ceiling; toggles can only hide more (g8).
import { passTargetBadgeLabel, passTargetKeyForRole, type RoleId } from '../sim';
import type { Cue, CueKind, CueLevel, Phase, PlayScenario } from './plays';

export interface CueToggles {
  readonly floorArrows: boolean;
  readonly targetRings: boolean;
  readonly prompts: boolean;
}
export type CueToggle = keyof CueToggles;

export const DEFAULT_CUE_TOGGLES: CueToggles = {
  floorArrows: true,
  targetRings: true,
  prompts: true,
};

/** Spot markers belong to the target-highlight family, so they follow the targetRings toggle. */
export const CUE_TOGGLE_FOR_KIND: Readonly<Record<CueKind, CueToggle>> = {
  floorArrow: 'floorArrows',
  targetRing: 'targetRings',
  spotMarker: 'targetRings',
  prompt: 'prompts',
};

export function visibleCues(phase: Phase, level: CueLevel, toggles: CueToggles): readonly Cue[] {
  return phase.cues[level].filter((c) => toggles[CUE_TOGGLE_FOR_KIND[c.kind]]);
}

export function phaseCues(
  play: PlayScenario,
  phaseId: string,
  level: CueLevel,
  toggles: CueToggles,
): readonly Cue[] {
  const phase = play.phases.find((p) => p.id === phaseId);
  if (phase === undefined) {
    throw new Error(`Court Vision: unknown phase "${phaseId}" in play "${play.id}"`);
  }
  return visibleCues(phase, level, toggles);
}

/** Movement cues show immediately; every other kind is a decision cue that a mode may delay. */
export const MOVEMENT_CUE_KINDS: ReadonlySet<CueKind> = new Set<CueKind>([
  'floorArrow',
  'spotMarker',
]);

export function isDecisionCue(cue: Cue): boolean {
  return !MOVEMENT_CUE_KINDS.has(cue.kind);
}

/** The teammate a decision cue points at, or null when it names none. */
export function decisionCueTarget(cue: Cue): RoleId | null {
  if (cue.kind === 'targetRing') return cue.role;
  if (cue.kind === 'prompt') return cue.passTo ?? null;
  return null;
}

export interface DecisionCueGate {
  /** Sim seconds since the current phase started. */
  readonly phaseElapsedSeconds: number;
  /** Mode delay; null = no gating. */
  readonly delaySeconds: number | null;
  /** True when the teammate in this role currently has an opening. */
  isOpen(role: RoleId): boolean;
}

/**
 * Holds decision cues back until the delay has passed or their target is open. Only hides cues,
 * never adds any (g8). Order is preserved.
 */
export function gateDecisionCues(cues: readonly Cue[], gate: DecisionCueGate): readonly Cue[] {
  const delay = gate.delaySeconds;
  if (delay === null) return cues;
  return cues.filter((cue) => {
    if (!isDecisionCue(cue)) return true;
    if (gate.phaseElapsedSeconds >= delay) return true;
    const target = decisionCueTarget(cue);
    return target !== null && gate.isOpen(target);
  });
}

export interface CuePrompt {
  readonly headline: string;
  readonly reason: string | null;
}

/** The do-this-now prompt for a cue list, with the g7 key badge on pass prompts. */
export function promptForCues(cues: readonly Cue[]): CuePrompt | null {
  for (const cue of cues) {
    if (cue.kind !== 'prompt') continue;
    const key = cue.passTo === undefined ? null : passTargetKeyForRole(cue.passTo);
    const headline = key === null ? cue.text : `${cue.text} (${passTargetBadgeLabel(key)})`;
    return { headline, reason: cue.reason ?? null };
  }
  return null;
}
