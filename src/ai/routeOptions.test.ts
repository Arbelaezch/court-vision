// Route options (DecisionOption.branch): a decision option resolved by moving, graded when the run
// takes the decision phase's reachedSpot transition to the option's branch. Uses the routeTest
// fixture (./testPlays.ts), so nothing here names a bundled play.
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PLAY_SOURCES,
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  phasesReachableFrom,
  type ModeConfig,
  type PlayScenario,
} from '../content';
import type { GameEvent } from '../sim';
import {
  GRADE_REASONS,
  classifyAction,
  classifyRoute,
  findDecisionPoint,
  routeSpot,
  type ResolvingAction,
} from './grading';
import {
  createCorrectReadBot,
  createWrongReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunControllerState,
} from './index';
import { ROUTE_TEST_PLAY_DATA, ROUTE_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const PLAY = loadPlaybook(roles, [
  ...BUNDLED_PLAY_SOURCES,
  { file: ROUTE_TEST_PLAY_FILE, data: ROUTE_TEST_PLAY_DATA },
]).routeTest as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE = loadMode('scrimmage');
const SEEDS = [1, 2, 3, 4, 5];
const MAX_STEPS = 2400;

function decision(id: string) {
  const d = PLAY.decisions.find((x) => x.id === id);
  if (d === undefined) throw new Error(`no decision ${id}`);
  return d;
}

function run(mode: ModeConfig, coverageId: string, seed: number, bot: PlayBot) {
  let controller: RunControllerState = startRunController(PLAY, mode, {
    seed,
    ...SETUPS,
    coverageId,
  });
  const events: GameEvent[] = [];
  const phases = new Set<string>();
  for (let i = 0; i < MAX_STEPS; i++) {
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    events.push(...step.events);
    phases.add(controller.run.phaseId);
    if (step.attempt !== null) return { attempt: step.attempt, controller, events, phases };
  }
  throw new Error(`no attempt after ${MAX_STEPS} steps (${mode.id}/${coverageId}/${seed})`);
}

describe('classifyRoute', () => {
  const input = { role: 'PG' as const, phaseId: 'pick', nextPhaseId: 'goLeft' };

  it('grades the route option per coverage', () => {
    expect(classifyRoute(PLAY, { ...input, coverageId: 'shadeRight' })).toEqual({
      kind: 'option',
      decisionId: 'routePick',
      optionId: 'leanLeft',
      grade: 'great',
      reason: GRADE_REASONS.great,
      exactMove: true,
    });
    expect(classifyRoute(PLAY, { ...input, coverageId: 'shadeLeft' })).toMatchObject({
      optionId: 'leanLeft',
      grade: 'bad',
    });
    expect(
      classifyRoute(PLAY, { ...input, nextPhaseId: 'goRight', coverageId: 'shadeLeft' }),
    ).toMatchObject({ optionId: 'leanRight', grade: 'great' });
  });

  it('returns null when the phase does not change', () => {
    expect(classifyRoute(PLAY, { ...input, nextPhaseId: 'pick', coverageId: 'shadeLeft' })).toBe(
      null,
    );
  });

  it('returns null from a phase whose decision has no route to the next phase', () => {
    expect(
      classifyRoute(PLAY, {
        role: 'PG',
        phaseId: 'goLeft',
        nextPhaseId: 'goRight',
        coverageId: 'shadeLeft',
      }),
    ).toBe(null);
  });

  it('returns null for a role with no decision there', () => {
    expect(classifyRoute(PLAY, { ...input, role: 'SG', coverageId: 'shadeLeft' })).toBe(null);
  });
});

describe('ball actions at a decision with only route options', () => {
  const at = { role: 'PG' as const, phaseId: 'pick', coverageId: 'shadeLeft' };

  it('calls a shot off script', () => {
    expect(classifyAction(PLAY, { ...at, action: { type: 'shoot' }, targetRole: null }).kind).toBe(
      'offScript',
    );
    expect(
      classifyAction(PLAY, { ...at, action: { type: 'floater' }, targetRole: null }).kind,
    ).toBe('offScript');
  });

  it('calls a pass a wrong teammate', () => {
    const action: ResolvingAction = { type: 'pass', passType: 'chestPass', targetId: -1 };
    expect(classifyAction(PLAY, { ...at, action, targetRole: 'SF' })).toMatchObject({
      kind: 'wrongTeammate',
    });
  });
});

describe('routeSpot and phasesReachableFrom', () => {
  it('returns the branch transition spot', () => {
    expect(routeSpot(PLAY, decision('routePick'), 'goLeft')).toEqual({ x: -2, z: 1.5 });
    expect(routeSpot(PLAY, decision('routePick'), 'goRight')).toEqual({ x: 2, z: 1.5 });
  });

  it('throws for a branch with no such transition', () => {
    expect(() => routeSpot(PLAY, decision('routePick'), 'pick')).toThrow(/Court Vision:/);
  });

  it('follows transitions, not array order', () => {
    expect(phasesReachableFrom(PLAY.phases, 'pick')).toEqual(new Set(['goLeft', 'goRight']));
    expect(phasesReachableFrom(PLAY.phases, 'goLeft')).toEqual(new Set());
  });

  it('finds the decision of each branch', () => {
    expect(findDecisionPoint(PLAY, 'PG', 'goLeft')?.id).toBe('leftFinish');
  });
});

describe.each([
  { mode: PRACTICE, coverageId: 'shadeLeft' },
  { mode: SCRIMMAGE, coverageId: 'shadeLeft' },
  { mode: SCRIMMAGE, coverageId: 'shadeRight' },
])('routeTest $mode.id/$coverageId', ({ mode, coverageId }) => {
  it.each(SEEDS)('correct-read bot succeeds Great through the route (seed %i)', (seed) => {
    const { attempt, controller } = run(mode, coverageId, seed, createCorrectReadBot(PLAY));
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    expect(controller.referee.graded).toContainEqual(
      expect.objectContaining({ decisionId: 'routePick', grade: 'great' }),
    );
  });

  it.each(SEEDS)('wrong-read bot fails on the route (seed %i)', (seed) => {
    const { attempt } = run(mode, coverageId, seed, createWrongReadBot(PLAY));
    if (mode.id === 'practice') {
      expect(attempt.outcome).toMatchObject({ kind: 'mistake' });
    } else {
      expect(attempt.outcome).toEqual(
        expect.objectContaining({ kind: 'unsuccessful', reason: GRADE_REASONS.bad }),
      );
    }
  });
});

describe('a route in the array-earlier branch ends on its final pass', () => {
  it.each(SEEDS)('scrimmage/shadeRight goes left and ends on the kick (seed %i)', (seed) => {
    const { attempt, controller, events, phases } = run(
      SCRIMMAGE,
      'shadeRight',
      seed,
      createCorrectReadBot(PLAY),
    );
    expect(phases.has('goRight')).toBe(false);
    expect(controller.run.phaseId).toBe('goLeft');
    expect(controller.referee.graded.map((g) => g.optionId)).toEqual(['leanLeft', 'kick']);
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    const sf = controller.game.players.find((p) => p.side === 'offense' && p.role === 'SF');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'passCompleted', receiverId: sf?.id }),
    );
  });
});

describe('a Good route in Scrimmage', () => {
  // Walk left (Good in `even`), then let the correct-read bot finish.
  const correct = createCorrectReadBot(PLAY);
  const goLeft: PlayBot = (state) => {
    if (state.run.phaseId !== 'pick') return correct(state);
    const me = state.game.players.find((p) => p.id === state.game.controlledPlayerId);
    if (me === undefined) throw new Error('no controlled player');
    const spot = routeSpot(PLAY, decision('routePick'), 'goLeft');
    const dx = spot.x - me.pos.x;
    const dz = spot.z - me.pos.z;
    const scale = Math.max(Math.hypot(dx, dz), 1);
    return [{ type: 'move', x: dx / scale, z: dz / scale }];
  };

  it.each(SEEDS)('continues and ends with quality Good (seed %i)', (seed) => {
    const { attempt, controller } = run(SCRIMMAGE, 'even', seed, goLeft);
    expect(controller.referee.graded[0]).toMatchObject({
      decisionId: 'routePick',
      optionId: 'leanLeft',
      grade: 'good',
      reason: GRADE_REASONS.good,
    });
    expect(attempt.outcome).toMatchObject({ kind: 'success', quality: 'good' });
  });
});
