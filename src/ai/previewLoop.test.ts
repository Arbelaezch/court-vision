// Preview loop: every play cycles through all its coverages with live defenders, then wraps.
import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import {
  PREVIEW_MAX_COVERAGE_STEPS,
  createCorrectReadBot,
  previewCoverageName,
  startPreviewLoop,
  stepPreviewLoop,
  type PreviewLoopState,
} from './index';

const roles = loadCastContent().roles;
const PLAYS = Object.values(loadPlaybook(roles)) as PlayScenario[];
const OPTIONS = {
  seed: 1,
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SCRIMMAGE = loadMode('scrimmage');
const PRACTICE = loadMode('practice');

describe('preview loop', () => {
  for (const play of PLAYS) {
    it(`${play.id}: visits every coverage in order, one attempt each, then wraps`, () => {
      const bot = createCorrectReadBot(play);
      let loop = startPreviewLoop(play, SCRIMMAGE, OPTIONS);
      const names = [previewCoverageName(play, loop)];
      const attemptsPerSegment: number[] = [0];
      const cap = play.coverages.length * (PREVIEW_MAX_COVERAGE_STEPS + 1);
      for (let i = 0; i < cap && names.length <= play.coverages.length; i++) {
        const result = stepPreviewLoop(play, loop, bot);
        loop = result.loop;
        expect(loop.controller.game.defenseMode).toBe('live');
        if (result.step.attempt !== null) {
          attemptsPerSegment[attemptsPerSegment.length - 1]! += 1;
        }
        if (result.step.reset) {
          names.push(previewCoverageName(play, loop));
          attemptsPerSegment.push(0);
        }
      }
      expect(names).toEqual([...play.coverages.map((c) => c.name), play.coverages[0]!.name]);
      expect(attemptsPerSegment.slice(0, play.coverages.length)).toEqual(
        play.coverages.map(() => 1),
      );
    });
  }

  it('rejects a mode without live defenders', () => {
    const play = PLAYS[0]!;
    expect(() => startPreviewLoop(play, PRACTICE, OPTIONS)).toThrow(/live-defense/);
  });

  it('an idle bot still advances to the next coverage', () => {
    const play = PLAYS[0]!;
    let loop = startPreviewLoop(play, SCRIMMAGE, OPTIONS);
    for (let i = 0; i < PREVIEW_MAX_COVERAGE_STEPS + 1 && loop.coverageIndex === 0; i++) {
      loop = stepPreviewLoop(play, loop, () => []).loop;
    }
    expect(loop.coverageIndex).toBe(1 % play.coverages.length);
    expect(loop.coverageIndex).not.toBe(0);
  });

  it('is deterministic', () => {
    const play = PLAYS[0]!;
    const run = (): PreviewLoopState => {
      const bot = createCorrectReadBot(play);
      let loop = startPreviewLoop(play, SCRIMMAGE, OPTIONS);
      for (let i = 0; i < 300; i++) loop = stepPreviewLoop(play, loop, bot).loop;
      return loop;
    };
    expect(run().controller.game).toEqual(run().controller.game);
  });

  it('throws when stepped with a different play', () => {
    const [a, b] = PLAYS;
    if (a === undefined || b === undefined) throw new Error('need two plays');
    const loop = startPreviewLoop(a, SCRIMMAGE, OPTIONS);
    expect(() => stepPreviewLoop(b, loop, () => [])).toThrow();
  });
});
