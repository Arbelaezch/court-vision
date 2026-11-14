import { describe, expect, it } from 'vitest';
import { MODE_CUE_LEVELS, MODE_IDS } from './modes';
import { CUE_LEVELS } from './plays';

describe('MODE_CUE_LEVELS', () => {
  it('maps practice to full and scrimmage to reduced', () => {
    expect(MODE_CUE_LEVELS).toEqual({ practice: 'full', scrimmage: 'reduced' });
  });

  it('only uses known cue levels and covers every mode', () => {
    for (const mode of MODE_IDS) {
      expect(CUE_LEVELS).toContain(MODE_CUE_LEVELS[mode]);
    }
  });
});
