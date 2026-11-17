// Play x coverage backbone suite (DESIGN_DOC 13). Cases come from loadPlaybook (which reads
// BUNDLED_PLAY_SOURCES), so a new play file that is in the registry (playbook.test.ts already
// requires that) adds cases here with no edit. Each play gets one Practice case on its practice
// coverage and one Scrimmage case per coverage, run through the real mode configs.
//
// The correct-read bot must end every run in a great success; the wrong-read bot must end every
// run in a mistake, or an unsuccessful run graded Bad.
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
  type ScenarioTable,
} from '../content';
import type { GameEvent } from '../sim';
import { GRADE_REASONS } from './grading';
import {
  createCorrectReadBot,
  createWrongReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunAttempt,
} from './index';
import { SCREEN_TEST_PLAY_DATA, SCREEN_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE = loadMode('scrimmage');
const SEEDS = [1, 2, 3, 4, 5];
/** Covers the 24 s (1440-step) shot clock with margin: a stalled run fails, never hangs. */
const MAX_STEPS = 2400;

interface BotCase {
  play: PlayScenario;
  mode: ModeConfig;
  coverageId: string;
}

function casesFor(playbook: ScenarioTable): BotCase[] {
  const cases: BotCase[] = [];
  for (const play of Object.values(playbook)) {
    cases.push({ play, mode: PRACTICE, coverageId: play.practiceCoverage });
    for (const c of play.coverages) cases.push({ play, mode: SCRIMMAGE, coverageId: c.id });
  }
  return cases;
}

const CASES = casesFor(loadPlaybook(roles));

function runWithBot(
  c: BotCase,
  seed: number,
  bot: PlayBot,
): { attempt: RunAttempt; events: GameEvent[]; debug: string } {
  let controller = startRunController(c.play, c.mode, {
    seed,
    ...SETUPS,
    coverageId: c.coverageId,
  });
  const events: GameEvent[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const step = stepRunController(c.play, controller, bot(controller));
    controller = step.controller;
    events.push(...step.events);
    if (step.attempt !== null) {
      return { attempt: step.attempt, events, debug: debugOf(c, seed, controller) };
    }
  }
  throw new Error(`no attempt after ${MAX_STEPS} steps: ${debugOf(c, seed, controller)}`);
}

function debugOf(
  c: BotCase,
  seed: number,
  controller: ReturnType<typeof startRunController>,
): string {
  const { game, run } = controller;
  const human = game.players.find((p) => p.side === 'offense' && p.role === run.humanRole);
  return JSON.stringify({
    case: `${c.play.id}/${c.mode.id}/${c.coverageId}`,
    seed,
    phase: run.phaseId,
    ball: game.ball,
    human: human === undefined ? null : human.pos,
    deviated: run.deviated,
    outcome: controller.referee.outcome,
  });
}

describe('case discovery', () => {
  it('finds at least one case', () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  it('lists the Give-and-Go cases', () => {
    const ids = CASES.filter((c) => c.play.id === 'giveAndGo').map(
      (c) => `${c.mode.id}/${c.coverageId}`,
    );
    expect(ids).toEqual(['practice/ballWatch', 'scrimmage/ballWatch', 'scrimmage/helpOnCut']);
  });

  it('lists the Drive-and-Kick cases', () => {
    const ids = CASES.filter((c) => c.play.id === 'driveAndKick').map(
      (c) => `${c.mode.id}/${c.coverageId}`,
    );
    expect(ids).toEqual([
      'practice/helpSteps',
      'scrimmage/helpSteps',
      'scrimmage/noHelp',
      'scrimmage/bigAtRim',
      'scrimmage/aggressiveCloseout',
    ]);
  });

  it('lists the Dribble Handoff cases', () => {
    const ids = CASES.filter((c) => c.play.id === 'dribbleHandoff').map(
      (c) => `${c.mode.id}/${c.coverageId}`,
    );
    expect(ids).toEqual([
      'practice/overTheTop',
      'scrimmage/overTheTop',
      'scrimmage/underTheScreen',
      'scrimmage/switchOnHandoff',
    ]);
  });

  it('lists the High Pick-and-Roll cases', () => {
    const ids = CASES.filter((c) => c.play.id === 'highPickAndRoll').map(
      (c) => `${c.mode.id}/${c.coverageId}`,
    );
    expect(ids).toEqual([
      'practice/dropBig',
      'scrimmage/dropBig',
      'scrimmage/hedgeRecover',
      'scrimmage/switchOnScreen',
      'scrimmage/cornerHelp',
    ]);
  });

  it('lists the Horns Set cases', () => {
    const ids = CASES.filter((c) => c.play.id === 'hornsSet').map(
      (c) => `${c.mode.id}/${c.coverageId}`,
    );
    expect(ids).toEqual([
      'practice/dropBoth',
      'scrimmage/overplayLeft',
      'scrimmage/overplayRight',
      'scrimmage/dropBoth',
      'scrimmage/cornerHelp',
    ]);
  });

  it('adds cases for an extra play source with no test edit', () => {
    const extended = casesFor(
      loadPlaybook(roles, [
        ...BUNDLED_PLAY_SOURCES,
        { file: SCREEN_TEST_PLAY_FILE, data: SCREEN_TEST_PLAY_DATA },
      ]),
    );
    const ids = extended
      .filter((c) => c.play.id === 'screenTest')
      .map((c) => `${c.mode.id}/${c.coverageId}`);
    expect(ids).toEqual(
      expect.arrayContaining(['practice/standard', 'scrimmage/standard', 'scrimmage/switchAll']),
    );
  });
});

describe.each(CASES)('$play.id in $mode.id vs $coverageId', (c) => {
  it.each(SEEDS)('correct-read bot succeeds with a great read (seed %i)', (seed) => {
    const { attempt, events, debug } = runWithBot(c, seed, createCorrectReadBot(c.play));
    expect(attempt.outcome, debug).toMatchObject({ kind: 'success', quality: 'great' });
    expect(attempt.success, debug).toBe(true);
    expect(
      events.filter((e) => e.type === 'mistake' || e.type === 'runUnsuccessful'),
      debug,
    ).toEqual([]);
  });

  it.each(SEEDS)('wrong-read bot fails the run (seed %i)', (seed) => {
    const { attempt, debug } = runWithBot(c, seed, createWrongReadBot(c.play));
    expect(attempt.success, debug).toBe(false);
    const { outcome } = attempt;
    const ok =
      outcome.kind === 'mistake' ||
      (outcome.kind === 'unsuccessful' && outcome.reason === GRADE_REASONS.bad);
    expect(ok, debug).toBe(true);
  });
});
