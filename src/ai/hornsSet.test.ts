// Horns Set specifics: loaded shape, left/right geometry, and the graded side choice (a route option).
import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type ModeConfig,
  type PlayScenario,
} from '../content';
import { GRADE_REASONS, classifyRoute } from './grading';
import {
  createCorrectReadBot,
  createWrongReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunAttempt,
  type RunControllerState,
} from './index';

const roles = loadCastContent().roles;
const PLAY = loadPlaybook(roles).hornsSet as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SCRIMMAGE = loadMode('scrimmage');
const MAX_STEPS = 2400;

function sideSpot(phaseId: string) {
  const t = PLAY.phases.find((p) => p.id === 'choose')?.transitions.find((x) => x.to === phaseId);
  if (t === undefined || t.trigger.kind !== 'reachedSpot') throw new Error('no side spot');
  return t.trigger.spot;
}

/** Walk the PG to the given side's spot and stop once the run leaves `choose`. */
function walkToSide(coverageId: string, branch: 'leftScreen' | 'rightScreen') {
  const spot = sideSpot(branch);
  let controller: RunControllerState = startRunController(PLAY, SCRIMMAGE, {
    seed: 1,
    ...SETUPS,
    coverageId,
  });
  for (let i = 0; i < MAX_STEPS; i++) {
    const me = controller.game.players.find((p) => p.id === controller.game.controlledPlayerId);
    if (me === undefined) throw new Error('no controlled player');
    const dx = spot.x - me.pos.x;
    const dz = spot.z - me.pos.z;
    const scale = Math.max(Math.hypot(dx, dz), 1);
    const step = stepRunController(PLAY, controller, [
      { type: 'move', x: dx / scale, z: dz / scale },
    ]);
    controller = step.controller;
    if (step.attempt !== null) return { attempt: step.attempt, controller };
    if (controller.run.phaseId === branch) return { attempt: null, controller };
  }
  throw new Error('walk never finished');
}

/** Walk to the given side's spot in `choose`, then hand the run to the correct-read bot, or to the
 *  wrong-read bot once the final read phase of that side is reached. */
function sideBot(branch: 'leftScreen' | 'rightScreen', wrongAtRead: boolean): PlayBot {
  const spot = sideSpot(branch);
  const readPhase = branch === 'leftScreen' ? 'leftRead' : 'rightRead';
  const correct = createCorrectReadBot(PLAY);
  const wrong = createWrongReadBot(PLAY);
  return (state) => {
    if (state.run.phaseId === 'choose') {
      const me = state.game.players.find((p) => p.id === state.game.controlledPlayerId);
      if (me === undefined) throw new Error('no controlled player');
      const dx = spot.x - me.pos.x;
      const dz = spot.z - me.pos.z;
      const scale = Math.max(Math.hypot(dx, dz), 1);
      return [{ type: 'move', x: dx / scale, z: dz / scale }];
    }
    return wrongAtRead && state.run.phaseId === readPhase ? wrong(state) : correct(state);
  };
}

function runSide(mode: ModeConfig, coverageId: string, seed: number, bot: PlayBot): RunAttempt {
  let controller: RunControllerState = startRunController(PLAY, mode, {
    seed,
    ...SETUPS,
    coverageId,
  });
  for (let i = 0; i < MAX_STEPS; i++) {
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    if (step.attempt !== null) return step.attempt;
  }
  throw new Error(`no attempt after ${MAX_STEPS} steps (${mode.id}/${coverageId}/${seed})`);
}

const SIDE_CASES: { mode: ModeConfig; coverageId: string }[] = [
  { mode: loadMode('practice'), coverageId: 'dropBoth' },
  { mode: SCRIMMAGE, coverageId: 'dropBoth' },
  { mode: SCRIMMAGE, coverageId: 'cornerHelp' },
];

describe.each(['leftScreen', 'rightScreen'] as const)('going to %s', (branch) => {
  describe.each(SIDE_CASES)('$mode.id vs $coverageId', ({ mode, coverageId }) => {
    it.each([1, 2, 3, 4, 5])('the correct read succeeds with a great read (seed %i)', (seed) => {
      const attempt = runSide(mode, coverageId, seed, sideBot(branch, false));
      expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    });

    it.each([1, 2, 3, 4, 5])('a wrong final read fails the run (seed %i)', (seed) => {
      const attempt = runSide(mode, coverageId, seed, sideBot(branch, true));
      expect(attempt.success).toBe(false);
      const { outcome } = attempt;
      expect(
        outcome.kind === 'mistake' ||
          (outcome.kind === 'unsuccessful' && outcome.reason === GRADE_REASONS.bad),
      ).toBe(true);
    });
  });
});

describe('Horns Set data', () => {
  it('loads with the planned shape', () => {
    expect(PLAY.difficulty).toBe(5);
    expect(PLAY.playableRoles).toEqual(['PG']);
    expect(PLAY.practiceCoverage).toBe('dropBoth');
    expect(PLAY.coverages.map((c) => c.id)).toEqual([
      'overplayLeft',
      'overplayRight',
      'dropBoth',
      'cornerHelp',
    ]);
    expect(PLAY.decisions.map((d) => d.id)).toEqual(['sideRead', 'leftRead', 'rightRead']);
  });

  it('puts the PF left, the C right and the wings in the corners', () => {
    const pos = PLAY.setup.positions;
    expect(pos.PF.x).toBeLessThan(0);
    expect(pos.C.x).toBeGreaterThan(0);
    expect(pos.SF.x).toBeLessThan(-5);
    expect(pos.SG.x).toBeGreaterThan(5);
    expect(sideSpot('leftScreen').x).toBeLessThan(0);
    expect(sideSpot('rightScreen').x).toBeGreaterThan(0);
  });
});

describe('the side choice is graded', () => {
  const grade = (coverageId: string, nextPhaseId: string) =>
    classifyRoute(PLAY, { role: 'PG', phaseId: 'choose', nextPhaseId, coverageId })?.grade;

  it('left is great against the right overplay, not against the left one', () => {
    expect(grade('overplayRight', 'leftScreen')).toBe('great');
    expect(grade('overplayLeft', 'leftScreen')).not.toBe('great');
  });

  it('right is great against the left overplay, not against the right one', () => {
    expect(grade('overplayLeft', 'rightScreen')).toBe('great');
    expect(grade('overplayRight', 'rightScreen')).not.toBe('great');
  });

  it('a Scrimmage run records the great side choice', () => {
    const left = walkToSide('overplayRight', 'leftScreen');
    expect(left.controller.referee.graded).toContainEqual(
      expect.objectContaining({
        decisionId: 'sideRead',
        optionId: 'useLeftScreen',
        grade: 'great',
      }),
    );
    const right = walkToSide('overplayLeft', 'rightScreen');
    expect(right.controller.referee.graded).toContainEqual(
      expect.objectContaining({
        decisionId: 'sideRead',
        optionId: 'useRightScreen',
        grade: 'great',
      }),
    );
  });

  it('a Scrimmage run ends unsuccessful when the PG goes into the overplay', () => {
    const left = walkToSide('overplayLeft', 'leftScreen');
    expect(left.attempt?.outcome).toEqual(
      expect.objectContaining({ kind: 'unsuccessful', reason: GRADE_REASONS.bad }),
    );
    const right = walkToSide('overplayRight', 'rightScreen');
    expect(right.attempt?.outcome).toEqual(
      expect.objectContaining({ kind: 'unsuccessful', reason: GRADE_REASONS.bad }),
    );
  });
});
