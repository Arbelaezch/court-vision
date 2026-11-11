import { describe, it, expect } from 'vitest';
import type { MistakeKind, RunGrade } from '../sim';
import { soundForEvent } from './eventSounds';

describe('soundForEvent', () => {
  const mistakeKinds: MistakeKind[] = ['wrongTeammate', 'offScript', 'turnover'];
  for (const kind of mistakeKinds) {
    it(`maps a ${kind} mistake to the whistle`, () => {
      expect(soundForEvent({ type: 'mistake', tick: 3, kind, reason: 'test' })).toBe('whistle');
    });
  }

  const grades: RunGrade[] = ['perfect', 'good'];
  for (const grade of grades) {
    it(`maps a ${grade} run success to the chime`, () => {
      expect(soundForEvent({ type: 'runSuccess', tick: 10, grade })).toBe('chime');
    });
  }

  it('plays nothing for an unsuccessful run (Bad look)', () => {
    expect(soundForEvent({ type: 'runUnsuccessful', tick: 10, reason: 'Bad look' })).toBeNull();
  });
});
