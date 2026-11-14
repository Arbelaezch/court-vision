// Which cues show for a phase. Mode cue level is the ceiling; toggles can only hide more (g8).
import { passTargetBadgeLabel, passTargetKeyForRole } from '../sim';
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
