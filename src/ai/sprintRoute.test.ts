// Sprint route options (DecisionOption move `sprint` with a `branch`): a `move` and a `sprint`
// option share one branch, and the referee grades the one matching whether the human sprinted
// during the decision phase. Uses the sprintTest fixture (./testPlays.ts), so nothing here names a
// bundled play.
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PLAY_SOURCES,
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type ModeConfig,
  type PlayScenario,
} from '../content';
import type { GameEvent, SimAction } from '../sim';
import { GRADE_REASONS, MISTAKE_REASONS, classifyRoute } from './grading';
import {
  createCorrectReadBot,
  createWrongReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunControllerState,
} from './index';
import { SPRINT_TEST_PLAY_DATA, SPRINT_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;

function loadSprintTest(data: unknown): PlayScenario {
  return loadPlaybook(roles, [...BUNDLED_PLAY_SOURCES, { file: SPRINT_TEST_PLAY_FILE, data }])
    .sprintTest as PlayScenario;
}

const PLAY = loadSprintTest(SPRINT_TEST_PLAY_DATA);
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE = loadMode('scrimmage');
const SEEDS = [1, 2, 3, 4, 5];
const MAX_STEPS = 2400;

function run(mode: ModeConfig, coverageId: string, seed: number, bot: PlayBot) {
  let controller: RunControllerState = startRunController(PLAY, mode, {
    seed,
    ...SETUPS,
    coverageId,
  });
  const events: GameEvent[] = [];
  const actionsByPhase = new Map<string, SimAction[]>();
  // The controller on the first step that ended in each phase.
  const firstInPhase = new Map<string, RunControllerState>();
  for (let i = 0; i < MAX_STEPS; i++) {
    const actions = bot(controller);
    const phaseBefore = controller.run.phaseId;
    actionsByPhase.set(phaseBefore, [...(actionsByPhase.get(phaseBefore) ?? []), ...actions]);
    const step = stepRunController(PLAY, controller, actions);
    controller = step.controller;
    events.push(...step.events);
    if (!firstInPhase.has(controller.run.phaseId)) {
      firstInPhase.set(controller.run.phaseId, controller);
    }
    if (step.attempt !== null) {
      return { attempt: step.attempt, controller, events, actionsByPhase, firstInPhase };
    }
  }
  throw new Error(`no attempt after ${MAX_STEPS} steps (${mode.id}/${coverageId}/${seed})`);
}

/** The correct-read bot with every sprint action forced to `held` (only in `phase`, if given). */
function withSprint(held: boolean, phase?: string): PlayBot {
  const correct = createCorrectReadBot(PLAY);
  return (state) =>
    correct(state).map((a) =>
      a.type === 'sprint' && (phase === undefined || state.run.phaseId === phase)
        ? { type: 'sprint', held }
        : a,
    );
}

const WALKING = withSprint(false);

describe('classifyRoute with sprint options', () => {
  const input = {
    role: 'PG' as const,
    phaseId: 'approach',
    nextPhaseId: 'finish',
    coverageId: 'rushes',
  };

  it('picks the sprint option when the role sprinted', () => {
    expect(classifyRoute(PLAY, { ...input, sprinted: true })).toEqual({
      kind: 'option',
      decisionId: 'approachRead',
      optionId: 'sprintIn',
      grade: 'great',
      reason: GRADE_REASONS.great,
      exactMove: true,
    });
  });

  it('picks the move option when the role did not sprint', () => {
    const walked = {
      kind: 'option',
      decisionId: 'approachRead',
      optionId: 'walkIn',
      grade: 'good',
      reason: GRADE_REASONS.good,
      exactMove: true,
    };
    expect(classifyRoute(PLAY, { ...input, sprinted: false })).toEqual(walked);
    expect(classifyRoute(PLAY, input)).toEqual(walked);
  });

  it('falls back to the first option for the branch, flagged not exact', () => {
    const great = { rushes: 'great', sits: 'great', walls: 'great' };
    const data = {
      ...SPRINT_TEST_PLAY_DATA,
      decisions: SPRINT_TEST_PLAY_DATA.decisions.map((d) =>
        d.id === 'approachRead'
          ? {
              ...d,
              options: d.options
                .filter((o) => o.id !== 'walkIn')
                .map((o) => ({ ...o, grades: great })),
            }
          : d,
      ),
    };
    const sprintOnly = loadSprintTest(data);
    expect(classifyRoute(sprintOnly, { ...input, sprinted: false })).toMatchObject({
      optionId: 'sprintIn',
      grade: 'great',
      exactMove: false,
    });
  });
});

describe('sprintTest scrimmage/rushes', () => {
  it.each(SEEDS)('the correct-read bot sprints and succeeds Great (seed %i)', (seed) => {
    const { attempt, controller, actionsByPhase, firstInPhase } = run(
      SCRIMMAGE,
      'rushes',
      seed,
      createCorrectReadBot(PLAY),
    );
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    expect(controller.referee.graded).toContainEqual(
      expect.objectContaining({ decisionId: 'approachRead', optionId: 'sprintIn', grade: 'great' }),
    );
    expect(actionsByPhase.get('approach')).toContainEqual({ type: 'sprint', held: true });
    // The phase change resets the flag.
    expect(firstInPhase.get('finish')?.referee.sprintedThisPhase).toBe(false);
  });

  it.each(SEEDS)('a walking bot is graded Good and the run continues (seed %i)', (seed) => {
    const { attempt, controller, events } = run(SCRIMMAGE, 'rushes', seed, WALKING);
    expect(controller.referee.graded[0]).toMatchObject({
      decisionId: 'approachRead',
      optionId: 'walkIn',
      grade: 'good',
    });
    expect(events.some((e) => e.type === 'mistake' || e.type === 'runUnsuccessful')).toBe(false);
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'good' });
  });
});

describe('sprintTest practice/rushes', () => {
  it.each(SEEDS)('a walking bot is whistled (seed %i)', (seed) => {
    const { attempt } = run(PRACTICE, 'rushes', seed, WALKING);
    expect(attempt.outcome).toMatchObject({
      kind: 'mistake',
      reason: MISTAKE_REASONS.notThePlaysRead,
    });
  });
});

describe('sprintTest scrimmage/walls', () => {
  it.each(SEEDS)('sprinting is a Bad read (seed %i)', (seed) => {
    const { attempt } = run(SCRIMMAGE, 'walls', seed, withSprint(true, 'approach'));
    expect(attempt.outcome).toMatchObject({ kind: 'unsuccessful', reason: GRADE_REASONS.bad });
  });
});

describe.each(['sits', 'walls'])('sprintTest scrimmage/%s', (coverageId) => {
  it.each(SEEDS)('the correct-read bot walks and succeeds Great (seed %i)', (seed) => {
    const { attempt, controller, actionsByPhase } = run(
      SCRIMMAGE,
      coverageId,
      seed,
      createCorrectReadBot(PLAY),
    );
    const approach = actionsByPhase.get('approach') ?? [];
    expect(approach).toContainEqual({ type: 'sprint', held: false });
    expect(approach).not.toContainEqual({ type: 'sprint', held: true });
    expect(controller.referee.graded[0]).toMatchObject({ optionId: 'walkIn', grade: 'great' });
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'great' });
  });
});

describe.each([
  { mode: PRACTICE, coverageId: 'rushes' },
  { mode: SCRIMMAGE, coverageId: 'rushes' },
  { mode: SCRIMMAGE, coverageId: 'sits' },
  { mode: SCRIMMAGE, coverageId: 'walls' },
])('sprintTest $mode.id/$coverageId wrong-read bot', ({ mode, coverageId }) => {
  it.each(SEEDS)('fails the run (seed %i)', (seed) => {
    const { attempt } = run(mode, coverageId, seed, createWrongReadBot(PLAY));
    const failed =
      attempt.outcome.kind === 'mistake' ||
      (attempt.outcome.kind === 'unsuccessful' && attempt.outcome.reason === GRADE_REASONS.bad);
    expect(failed, JSON.stringify(attempt.outcome)).toBe(true);
  });
});
