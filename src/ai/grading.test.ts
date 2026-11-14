import { describe, expect, it } from 'vitest';
import { loadCastContent, loadPlaybook, loadScenario, type PlayScenario } from '../content';
import { GRADE_REASONS, MISTAKE_REASONS, classifyAction, findDecisionPoint } from './index';
import type { ResolvingAction } from './index';
import { SCREEN_TEST_PLAY_DATA, SCREEN_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SCREEN_TEST = loadScenario(
  { file: SCREEN_TEST_PLAY_FILE, data: SCREEN_TEST_PLAY_DATA },
  roles,
);

const chest: ResolvingAction = { type: 'pass', passType: 'chestPass', targetId: 0 };
const bounce: ResolvingAction = { type: 'pass', passType: 'bouncePass', targetId: 0 };
const shoot: ResolvingAction = { type: 'shoot' };
const floater: ResolvingAction = { type: 'floater' };

function classify(
  play: PlayScenario,
  phaseId: string,
  coverageId: string,
  action: ResolvingAction,
  targetRole: 'SG' | 'SF' | 'C' | null,
) {
  return classifyAction(play, { role: 'PG', phaseId, coverageId, action, targetRole });
}

describe('classifyAction', () => {
  it('grades the kickToWing pass per coverage', () => {
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', chest, 'SF')).toEqual({
      kind: 'option',
      decisionId: 'finishRead',
      optionId: 'kickToWing',
      grade: 'good',
      reason: GRADE_REASONS.good,
      exactMove: true,
    });
    expect(classify(GIVE_AND_GO, 'finish', 'helpOnCut', chest, 'SF')).toMatchObject({
      optionId: 'kickToWing',
      grade: 'great',
    });
  });

  it('falls back to the same-target option for another pass type', () => {
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', bounce, 'SF')).toMatchObject({
      kind: 'option',
      optionId: 'kickToWing',
    });
  });

  it('keeps the option grade for another pass type but flags it as not the exact move', () => {
    // screenTest roll: hitRoller is a bounce pass graded great; a chest pass is the same read.
    expect(classify(SCREEN_TEST, 'roll', 'standard', chest, 'C')).toMatchObject({
      optionId: 'hitRoller',
      grade: 'great',
      exactMove: false,
    });
    expect(classify(SCREEN_TEST, 'roll', 'standard', bounce, 'C')).toMatchObject({
      exactMove: true,
    });
  });

  it('grades shoot and floater', () => {
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', shoot, null)).toMatchObject({
      optionId: 'layup',
      grade: 'great',
    });
    expect(classify(GIVE_AND_GO, 'finish', 'helpOnCut', shoot, null)).toMatchObject({
      optionId: 'layup',
      grade: 'bad',
    });
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', floater, null)).toMatchObject({
      optionId: 'floater',
      grade: 'good',
    });
  });

  it('flags a pass to the wrong teammate', () => {
    const wrong = { kind: 'wrongTeammate', reason: 'Wrong teammate' };
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', chest, 'SG')).toEqual(wrong);
    expect(classify(GIVE_AND_GO, 'finish', 'ballWatch', chest, null)).toEqual(wrong);
    expect(MISTAKE_REASONS.wrongTeammate).toBe('Wrong teammate');
  });

  it('treats the phase without a decision by the track', () => {
    expect(classify(GIVE_AND_GO, 'entry', 'ballWatch', chest, 'SG')).toEqual({ kind: 'onPath' });
    expect(classify(GIVE_AND_GO, 'entry', 'ballWatch', chest, 'SF').kind).toBe('wrongTeammate');
    expect(classify(GIVE_AND_GO, 'entry', 'ballWatch', shoot, null)).toEqual({
      kind: 'offScript',
      reason: 'Off script',
    });
  });

  it('grades the screen test roll pass', () => {
    expect(classify(SCREEN_TEST, 'roll', 'standard', bounce, 'C')).toMatchObject({
      optionId: 'hitRoller',
      grade: 'great',
    });
  });

  it('throws for an unknown coverage', () => {
    expect(() => classify(GIVE_AND_GO, 'finish', 'nope', shoot, null)).toThrow(/Court Vision:/);
  });
});

describe('best read per coverage (#22)', () => {
  const coverageIds = GIVE_AND_GO.coverages.map((c) => c.id);

  it.each([
    ['ballWatch', shoot, null, 'layup'],
    ['helpOnCut', chest, 'SF', 'kickToWing'],
  ] as const)('%s: its best read is Great and not Great elsewhere', (own, action, role, id) => {
    expect(classify(GIVE_AND_GO, 'finish', own, action, role)).toMatchObject({
      kind: 'option',
      optionId: id,
      grade: 'great',
    });
    for (const other of coverageIds.filter((c) => c !== own)) {
      const result = classify(GIVE_AND_GO, 'finish', other, action, role);
      expect(result).toMatchObject({ kind: 'option', optionId: id });
      expect(result).not.toMatchObject({ grade: 'great' });
    }
  });

  it('every coverage has a Great option that is not Great in any other coverage', () => {
    const decisions = GIVE_AND_GO.decisions.filter((d) => d.id === 'finishRead');
    expect(decisions).toHaveLength(1);
    const options = decisions.flatMap((d) => d.options);
    for (const c of coverageIds) {
      const great = options.filter((o) => o.grades[c] === 'great');
      expect(great.length).toBeGreaterThan(0);
      for (const o of great) {
        for (const other of coverageIds.filter((x) => x !== c)) {
          expect(o.grades[other]).not.toBe('great');
        }
      }
    }
  });
});

describe('findDecisionPoint', () => {
  it('finds the decision by role and phase', () => {
    expect(findDecisionPoint(GIVE_AND_GO, 'PG', 'entry')).toBeNull();
    expect(findDecisionPoint(GIVE_AND_GO, 'PG', 'finish')?.id).toBe('finishRead');
  });
});
