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

  it('does not whistle a completed pass', () => {
    expect(
      soundForEvent({
        type: 'passCompleted',
        tick: 10,
        passType: 'chestPass',
        passerId: 0,
        receiverId: 1,
        receiverSet: true,
      }),
    ).toBeNull();
  });

  it('plays nothing for a resolved shot (a block whistles through its mistake event)', () => {
    expect(
      soundForEvent({
        type: 'shotResolved',
        tick: 10,
        shooterId: 0,
        shotType: 'jumper',
        zone: 'midRange',
        look: 'bad',
        makeChance: 0.15,
        made: false,
        blockerId: 5,
        reason: 'Contested shot',
      }),
    ).toBeNull();
  });

  it('plays nothing for an automatic screen being set', () => {
    expect(soundForEvent({ type: 'screenSet', tick: 10, screenerId: 4, targetId: 0 })).toBeNull();
  });
});
