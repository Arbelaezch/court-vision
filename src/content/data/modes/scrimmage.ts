// Scrimmage mode (DESIGN_DOC 8.2): live defenders, a seeded coverage per run, Reduced cues with
// decision cues held back for a short delay, 0.85x speed, a 24 s shot clock.
export const SCRIMMAGE_MODE_FILE = 'src/content/data/modes/scrimmage.ts';

export const SCRIMMAGE_MODE_DATA = {
  id: 'scrimmage',
  name: 'Scrimmage',
  rules: 'scrimmage',
  cueLevel: 'reduced',
  defense: 'live',
  speedMultiplier: 0.85,
  shotClockSeconds: 24,
  decisionCueDelaySeconds: 1.5,
};
