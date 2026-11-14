// Mode to cue level (DESIGN_DOC section 5, "Cue levels are configuration"). Live Play is added
// later as one more entry with 'none'.
import type { CueLevel } from './plays';

export const MODE_IDS = ['practice', 'scrimmage'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MODE_CUE_LEVELS: Readonly<Record<ModeId, CueLevel>> = {
  practice: 'full',
  scrimmage: 'reduced',
};
