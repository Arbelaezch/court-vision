import { describe, expect, it } from 'vitest';
import { RIM_CENTER } from '../sim';
import { loadSimShooting } from './simShooting';
import {
  TUTORIAL_CONTROLS,
  TUTORIAL_FINISHED,
  TUTORIAL_STEPS,
  tutorialTokens,
  type TutorialStep,
} from './tutorial';

function texts(step: TutorialStep): string[] {
  return [step.title, step.instruction, step.explain, step.retry ?? ''];
}

function stepById(id: string): TutorialStep {
  return TUTORIAL_STEPS.find((s) => s.id === id) as TutorialStep;
}

describe('tutorial steps', () => {
  it('has the seven steps in order', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'move',
      'sprint',
      'chestPass',
      'bouncePass',
      'lob',
      'shoot',
      'floater',
    ]);
  });

  it('never mentions a screen', () => {
    const all = [
      ...TUTORIAL_STEPS.flatMap(texts),
      TUTORIAL_FINISHED.headline,
      TUTORIAL_FINISHED.reason,
    ];
    for (const text of all) {
      expect(text.toLowerCase()).not.toContain('screen');
    }
  });

  it('only uses known control tokens', () => {
    for (const step of TUTORIAL_STEPS) {
      for (const text of [step.instruction, step.explain, step.retry ?? '']) {
        for (const token of tutorialTokens(text)) {
          expect(TUTORIAL_CONTROLS).toContain(token);
        }
      }
    }
  });

  it('puts a token in every instruction', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(tutorialTokens(step.instruction).length).toBeGreaterThan(0);
    }
  });

  it('says when to use each pass', () => {
    for (const id of ['chestPass', 'bouncePass', 'lob']) {
      expect(stepById(id).explain).toContain('Use it when');
    }
  });

  it('names the stamina bar on the sprint step', () => {
    expect(stepById('sprint').explain).toContain('stamina');
  });

  it('starts the floater step within floater range of the rim', () => {
    const start = stepById('floater').start;
    const distance = Math.hypot(start.x - RIM_CENTER.x, start.z - RIM_CENTER.z);
    expect(distance).toBeLessThanOrEqual(loadSimShooting().tuning.floaterMaxDistanceM);
  });

  it('extracts tokens', () => {
    expect(tutorialTokens('Press {shoot} or {lob}.')).toEqual(['shoot', 'lob']);
    expect(tutorialTokens('none')).toEqual([]);
  });
});
