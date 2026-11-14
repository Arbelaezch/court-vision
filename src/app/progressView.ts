// App layer: DOM-free view model of per-play, per-mode progress (attempts, successes, Mastered).
import type { ModeId, ModeTable } from '../content';
import { isMastered, modeProgressFor, type ProgressSection } from './storage';

export interface ProgressModeLabel {
  readonly id: ModeId;
  readonly name: string;
}

export interface PlayModeStatus {
  readonly modeId: ModeId;
  readonly attempts: number;
  readonly successes: number;
  readonly mastered: boolean;
}

export interface PlayProgressRow {
  readonly playId: string;
  readonly modes: readonly PlayModeStatus[];
}

// DESIGN_DOC 8.4 tracks progress in both v1 modes; Scrimmage has no mode file until #29, so its
// name falls back here.
export const V1_PROGRESS_MODES: readonly ProgressModeLabel[] = [
  { id: 'practice', name: 'Practice' },
  { id: 'scrimmage', name: 'Scrimmage' },
];

export function progressModeLabels(modes: ModeTable): ProgressModeLabel[] {
  const out: ProgressModeLabel[] = V1_PROGRESS_MODES.map((m) => {
    const mode = Object.hasOwn(modes, m.id) ? modes[m.id] : undefined;
    return { id: m.id, name: mode?.name ?? m.name };
  });
  for (const id of Object.keys(modes)) {
    if (out.some((m) => m.id === id)) continue;
    const mode = modes[id];
    if (mode !== undefined) out.push({ id, name: mode.name });
  }
  return out;
}

export function buildProgressRows(
  playIds: readonly string[],
  modes: readonly ProgressModeLabel[],
  progress: ProgressSection,
  masteredSuccesses: number,
): PlayProgressRow[] {
  return playIds.map((playId) => ({
    playId,
    modes: modes.map((m) => {
      const counts = modeProgressFor(progress, playId, m.id);
      return {
        modeId: m.id,
        attempts: counts.attempts,
        successes: counts.successes,
        mastered: isMastered(counts, masteredSuccesses),
      };
    }),
  }));
}
