import { describe, expect, it } from 'vitest';
import { loadMasteryTuning, loadModes } from '../content';
import { MASTERY_FILE } from '../content/data/mastery';
import { V1_PROGRESS_MODES, buildProgressRows, progressModeLabels } from './progressView';

const progress = { plays: { giveAndGo: { practice: { attempts: 12, successes: 10 } } } };

describe('buildProgressRows', () => {
  it('marks Mastered at the bundled threshold in practice only', () => {
    const t = loadMasteryTuning().masteredSuccesses;
    const rows = buildProgressRows(['giveAndGo'], V1_PROGRESS_MODES, progress, t);
    expect(rows[0]?.modes).toEqual([
      { modeId: 'practice', attempts: 12, successes: 10, mastered: true },
      { modeId: 'scrimmage', attempts: 0, successes: 0, mastered: false },
    ]);
  });

  it('follows a changed threshold', () => {
    const t = loadMasteryTuning({ file: MASTERY_FILE, data: { masteredSuccesses: 11 } });
    const rows = buildProgressRows(['giveAndGo'], V1_PROGRESS_MODES, progress, t.masteredSuccesses);
    expect(rows[0]?.modes[0]?.mastered).toBe(false);
    const five = { plays: { giveAndGo: { practice: { attempts: 5, successes: 5 } } } };
    const low = buildProgressRows(['giveAndGo'], V1_PROGRESS_MODES, five, 5);
    expect(low[0]?.modes[0]?.mastered).toBe(true);
  });
});

describe('progressModeLabels', () => {
  it('lists practice then scrimmage with fallback names', () => {
    const modes = loadModes();
    expect(progressModeLabels(modes)).toEqual([
      { id: 'practice', name: modes.practice?.name },
      { id: 'scrimmage', name: 'Scrimmage' },
    ]);
  });

  it('lists extra modes third', () => {
    const modes = loadModes();
    const practice = modes.practice;
    if (practice === undefined) throw new Error('no practice mode');
    const labels = progressModeLabels({
      ...modes,
      drill: { ...practice, id: 'drill', name: 'Drill' },
    });
    expect(labels.map((l) => l.id)).toEqual(['practice', 'scrimmage', 'drill']);
    expect(labels[2]?.name).toBe('Drill');
  });
});
