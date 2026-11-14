// Practice mode (DESIGN_DOC 8.1): cone defenders instead of live defenders, Full cues, no shot
// clock. Each file in this folder is named `<modeId>.ts` and listed in BUNDLED_MODE_SOURCES.
export const PRACTICE_MODE_FILE = 'src/content/data/modes/practice.ts';

export const PRACTICE_MODE_DATA = {
  id: 'practice',
  name: 'Practice',
  rules: 'practice',
  cueLevel: 'full',
  defense: 'cones',
  speedMultiplier: 1,
  shotClockSeconds: null,
};
