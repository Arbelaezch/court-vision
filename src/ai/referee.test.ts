/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned play data loosely */
import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadPlaybook,
  loadScenario,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from '../content/data/plays/giveAndGo';
import {
  PASS_TURNOVER_REASONS,
  type CourtPoint,
  type GameEvent,
  type GameState,
  type RoleId,
  type ShootingSetup,
  type SimAction,
} from '../sim';
import {
  OUTCOME_RULES,
  runGradeFor,
  startPracticeRun,
  startReferee,
  stepPracticeRun,
  stepReferee,
  type PlayRunState,
  type RefereeOptions,
  type RefereeState,
} from './index';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const CUT_SPOT = { x: 0.8, z: -4 };

interface Run {
  game: GameState;
  run: PlayRunState;
}

interface Refereed extends Run {
  referee: RefereeState;
}

type ActionsFor = (state: Run) => SimAction[];

const PRACTICE: RefereeOptions = { mode: 'practice', humanRole: 'PG' };
const scrimmage = (coverageId: string): RefereeOptions => ({
  mode: 'scrimmage',
  humanRole: 'PG',
  coverageId,
});

function start(
  play: PlayScenario,
  seed = 1,
  options: RefereeOptions = PRACTICE,
  shooting: ShootingSetup = SETUPS.shooting,
): Refereed {
  const { game, run } = startPracticeRun(play, { seed, ...SETUPS, shooting });
  return { game, run, referee: startReferee(play, options) };
}

function offense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`no offense ${role}`);
  return player;
}

/** A move toward `spot` for the controlled player, ramping down inside 1 m, zero inside 0.1 m. */
function moveToward(game: GameState, spot: CourtPoint): SimAction {
  const me = game.players.find((p) => p.id === game.controlledPlayerId);
  if (me === undefined) throw new Error('no controlled player');
  const dx = spot.x - me.pos.x;
  const dz = spot.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return { type: 'move', x: 0, z: 0 };
  const scale = Math.max(d, 1);
  return { type: 'move', x: dx / scale, z: dz / scale };
}

const idle: ActionsFor = () => [];
const standStill: ActionsFor = () => [{ type: 'move', x: 0, z: 0 }];

function walkTo(spot: CourtPoint): ActionsFor {
  return (s) => [moveToward(s.game, spot)];
}

const inPhase = (phaseId: string) => (s: Run) => s.run.phaseId === phaseId;

interface Advanced {
  state: Refereed;
  /** Sim and play-run events, then the referee's events, per step. */
  events: GameEvent[];
  refereeEvents: GameEvent[];
  resetRequested: boolean;
}

/** Steps the run and the referee together up to `maxTicks` times, or until `stop` holds. */
function advanceRefereed(
  play: PlayScenario,
  state: Refereed,
  maxTicks: number,
  actionsFor: ActionsFor,
  options: { stop?: (s: Refereed) => boolean } = {},
): Advanced {
  const events: GameEvent[] = [];
  const refereeEvents: GameEvent[] = [];
  let resetRequested = false;
  let current = state;
  for (let ticks = 0; ticks < maxTicks; ticks += 1) {
    const actions = actionsFor(current);
    const next = stepPracticeRun(play, current.run, current.game, actions);
    const ref = stepReferee(play, current.referee, {
      before: current.game,
      phaseId: current.run.phaseId,
      actions,
      after: next.game,
    });
    events.push(...next.game.events, ...ref.events);
    refereeEvents.push(...ref.events);
    resetRequested ||= ref.resetRequested;
    current = { ...next, referee: ref.referee };
    if (options.stop?.(current)) break;
  }
  return { state: current, events, refereeEvents, resetRequested };
}

/** One step with explicit actions. */
function stepOnce(play: PlayScenario, state: Refereed, actions: SimAction[]): Advanced {
  return advanceRefereed(play, state, 1, () => actions);
}

/** giveAndGo: entry pass to SG, then steps until the phase is 'cut'. */
function entryPassToCut(play: PlayScenario, state: Refereed): Refereed {
  const sgId = offense(state.game, 'SG').id;
  const first = stepOnce(play, state, [{ type: 'pass', passType: 'chestPass', targetId: sgId }]);
  return advanceRefereed(play, first.state, 120, idle, { stop: inPhase('cut') }).state;
}

/** giveAndGo: entry pass, PG walks to the cut spot until the phase is 'finish' (PG holds). */
function toFinish(play: PlayScenario, state: Refereed): Refereed {
  const atCut = entryPassToCut(play, state);
  const walked = advanceRefereed(play, atCut, 1200, walkTo(CUT_SPOT), {
    stop: inPhase('finish'),
  });
  expect(walked.state.run.phaseId).toBe('finish');
  expect(walked.state.referee.outcome).toBeNull();
  expect(walked.refereeEvents).toEqual([]);
  return walked.state;
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

function passTo(game: GameState, role: RoleId): SimAction {
  return { type: 'pass', passType: 'chestPass', targetId: offense(game, role).id };
}

function zeroShooting(): ShootingSetup {
  const setup: any = structuredClone(SETUPS.shooting);
  for (const zone of Object.keys(setup.profiles.PG.shooting)) setup.profiles.PG.shooting[zone] = 0;
  return setup as ShootingSetup;
}

describe('OUTCOME_RULES and runGradeFor', () => {
  it('holds the decided mode rules', () => {
    expect(OUTCOME_RULES).toEqual({
      badLook: 'unsuccessful',
      badRead: 'unsuccessful',
      practiceOffPath: 'mistake',
    });
  });

  it('maps quality to the event grade', () => {
    expect(runGradeFor('great')).toBe('perfect');
    expect(runGradeFor('good')).toBe('good');
  });
});

describe('startReferee', () => {
  it('defaults Practice to the play standard coverage', () => {
    expect(startReferee(GIVE_AND_GO, PRACTICE)).toEqual({
      playId: 'giveAndGo',
      mode: 'practice',
      coverageId: GIVE_AND_GO.practiceCoverage,
      humanRole: 'PG',
      graded: [],
      pendingFinalPassTo: null,
      outcome: null,
    });
  });

  it('throws for a Practice coverage other than the standard one', () => {
    expect(() =>
      startReferee(GIVE_AND_GO, { mode: 'practice', humanRole: 'PG', coverageId: 'helpOnCut' }),
    ).toThrow(/Court Vision: Practice uses coverage ballWatch, got helpOnCut/);
  });

  it('throws for Scrimmage without a coverage or with an unknown one', () => {
    expect(() => startReferee(GIVE_AND_GO, { mode: 'scrimmage', humanRole: 'PG' })).toThrow(
      /Court Vision:/,
    );
    expect(() => startReferee(GIVE_AND_GO, scrimmage('zone'))).toThrow(/Court Vision:/);
  });

  it('throws for a role that is not playable', () => {
    expect(() => startReferee(GIVE_AND_GO, { mode: 'practice', humanRole: 'C' })).toThrow(
      /Court Vision:/,
    );
  });

  it('stepReferee throws for another play', () => {
    const s = start(GIVE_AND_GO);
    const other = { ...GIVE_AND_GO, id: 'other' };
    expect(() =>
      stepReferee(other, s.referee, {
        before: s.game,
        phaseId: s.run.phaseId,
        actions: [],
        after: s.game,
      }),
    ).toThrow(/Court Vision:/);
  });
});

describe('AC1: Practice standard path succeeds made or missed', () => {
  function shootAtFinish(seed: number, shooting?: ShootingSetup) {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, seed, PRACTICE, shooting));
    const shot = stepOnce(GIVE_AND_GO, atFinish, [{ type: 'shoot' }]);
    expect(shot.state.referee.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    expect(ofType(shot.events, 'runSuccess')).toEqual([
      expect.objectContaining({ grade: 'perfect' }),
    ]);
    expect(ofType(shot.events, 'mistake')).toEqual([]);
    expect(ofType(shot.events, 'runUnsuccessful')).toEqual([]);
    expect(shot.resetRequested).toBe(false);
    const resolved = ofType(shot.events, 'shotResolved');
    expect(resolved).toHaveLength(1);
    return resolved[0]?.made;
  }

  it('succeeds for every seed, and both made and missed shots occur', () => {
    const made = SEEDS.map((seed) => shootAtFinish(seed));
    // With default ratings every seed may make the shot; zero PG ratings force misses.
    const zeroed = SEEDS.map((seed) => shootAtFinish(seed, zeroShooting()));
    const all = [...made, ...zeroed];
    expect(all).toContain(true);
    expect(all).toContain(false);
  });
});

describe('AC2: wrong teammate is a mistake with reset, once', () => {
  const MODES: [string, RefereeOptions][] = [
    ['practice', PRACTICE],
    ['scrimmage ballWatch', scrimmage('ballWatch')],
  ];

  it.each(MODES)('%s: chestPass to SG at finish', (_, options) => {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, 1, options));
    const pass = stepOnce(GIVE_AND_GO, atFinish, [passTo(atFinish.game, 'SG')]);
    expect(pass.refereeEvents).toEqual([
      {
        type: 'mistake',
        tick: atFinish.game.tick + 1,
        kind: 'wrongTeammate',
        reason: 'Wrong teammate',
      },
    ]);
    expect(pass.resetRequested).toBe(true);
    const outcome = pass.state.referee.outcome;
    expect(outcome).toMatchObject({ kind: 'mistake', mistakeKind: 'wrongTeammate' });

    const later = advanceRefereed(GIVE_AND_GO, pass.state, 240, standStill);
    expect(later.refereeEvents).toEqual([]);
    expect(later.resetRequested).toBe(false);
    expect(later.state.referee.outcome).toEqual(outcome);
  });

  it.each(MODES)('%s: chestPass to SF at entry', (_, options) => {
    const s0 = start(GIVE_AND_GO, 1, options);
    const pass = stepOnce(GIVE_AND_GO, s0, [passTo(s0.game, 'SF')]);
    expect(pass.refereeEvents).toEqual([
      { type: 'mistake', tick: s0.game.tick + 1, kind: 'wrongTeammate', reason: 'Wrong teammate' },
    ]);
    expect(pass.resetRequested).toBe(true);
  });
});

describe('AC3: Scrimmage reads', () => {
  function kickToWing(coverageId: string, seed = 1) {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, seed, scrimmage(coverageId)));
    const release = stepOnce(GIVE_AND_GO, atFinish, [passTo(atFinish.game, 'SF')]);
    const settled = advanceRefereed(GIVE_AND_GO, release.state, 240, standStill, {
      stop: (s) => s.game.ball.kind === 'held',
    });
    return { release, settled };
  }

  it('ballWatch kickToWing continues at release and ends as a Good success', () => {
    const { release, settled } = kickToWing('ballWatch');
    expect(release.refereeEvents).toEqual([]);
    expect(release.state.referee.outcome).toBeNull();
    expect(release.resetRequested).toBe(false);
    expect(release.state.referee.graded).toEqual([
      expect.objectContaining({ decisionId: 'finishRead', optionId: 'kickToWing', grade: 'good' }),
    ]);
    expect(settled.state.referee.outcome).toMatchObject({ kind: 'success', quality: 'good' });
    expect(ofType(settled.events, 'runSuccess')).toEqual([
      expect.objectContaining({ grade: 'good' }),
    ]);
    expect(ofType(settled.events, 'mistake')).toEqual([]);
  });

  it('helpOnCut kickToWing ends as a Great success', () => {
    const { settled } = kickToWing('helpOnCut');
    expect(settled.state.referee.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    expect(ofType(settled.events, 'runSuccess')).toEqual([
      expect.objectContaining({ grade: 'perfect' }),
    ]);
  });

  it.each(SEEDS)('seed %i: ballWatch shoot ends as a Perfect success', (seed) => {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, seed, scrimmage('ballWatch')));
    const shot = stepOnce(GIVE_AND_GO, atFinish, [{ type: 'shoot' }]);
    expect(shot.state.referee.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    expect(ofType(shot.events, 'runSuccess')).toEqual([
      expect.objectContaining({ grade: 'perfect' }),
    ]);
  });

  it('helpOnCut shoot is an unsuccessful run without a mistake or reset', () => {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, 1, scrimmage('helpOnCut')));
    const shot = stepOnce(GIVE_AND_GO, atFinish, [{ type: 'shoot' }]);
    expect(ofType(shot.events, 'runUnsuccessful')).toEqual([
      expect.objectContaining({ reason: 'Bad read for this coverage' }),
    ]);
    expect(ofType(shot.events, 'mistake')).toEqual([]);
    expect(shot.resetRequested).toBe(false);
    expect(shot.state.referee.outcome).toMatchObject({ kind: 'unsuccessful' });
  });
});

describe('AC4: sim turnovers end the run as a mistake without a duplicate event', () => {
  it('out of bounds', () => {
    const s0 = start(GIVE_AND_GO, 1);
    const walked = advanceRefereed(GIVE_AND_GO, s0, 1200, walkTo({ x: 9, z: 2.5 }), {
      stop: (s) => s.referee.outcome !== null,
    });
    expect(walked.state.referee.outcome).toMatchObject({
      kind: 'mistake',
      mistakeKind: 'turnover',
      reason: 'Out of bounds',
    });
    expect(walked.resetRequested).toBe(true);
    expect(ofType(walked.events, 'mistake')).toHaveLength(1);
    expect(walked.refereeEvents).toEqual([]);
  });

  it('interception', () => {
    // Real interceptions: a live-mode cone on the entry lane steals the pass in some seeds.
    const data: any = structuredClone(GIVE_AND_GO_DATA);
    data.coverages[0].script[0].defenders.PG.spot = { x: 2.75, z: 0.75 };
    const play = loadScenario({ file: GIVE_AND_GO_FILE, data }, roles);
    const reasons: readonly string[] = Object.values(PASS_TURNOVER_REASONS);
    let intercepted = 0;
    for (const seed of SEEDS) {
      const s0 = start(play, seed);
      const live: Refereed = { ...s0, game: { ...structuredClone(s0.game), defenseMode: 'live' } };
      const first = stepOnce(play, live, [passTo(live.game, 'SG')]);
      const settled = advanceRefereed(play, first.state, 120, idle, {
        stop: (s) => s.game.ball.kind === 'held',
      });
      const mistakes = ofType([...first.events, ...settled.events], 'mistake');
      if (mistakes.length === 0) continue;
      intercepted += 1;
      expect(mistakes).toHaveLength(1);
      const mistake = mistakes[0];
      expect(reasons).toContain(mistake?.reason);
      expect(settled.state.referee.outcome).toEqual({
        kind: 'mistake',
        tick: mistake?.tick,
        mistakeKind: 'turnover',
        reason: mistake?.reason,
      });
      expect(first.resetRequested || settled.resetRequested).toBe(true);
    }
    expect(intercepted).toBeGreaterThan(0);
  });
});

describe('Practice rules', () => {
  it.each<[string, (game: GameState) => SimAction]>([
    ['floater', () => ({ type: 'floater' })],
    ['kickToWing', (game) => passTo(game, 'SF')],
  ])('%s at finish is not the play read', (_, actionFor) => {
    const atFinish = toFinish(GIVE_AND_GO, start(GIVE_AND_GO, 1));
    const step = stepOnce(GIVE_AND_GO, atFinish, [actionFor(atFinish.game)]);
    expect(step.refereeEvents).toEqual([
      {
        type: 'mistake',
        tick: atFinish.game.tick + 1,
        kind: 'offScript',
        reason: "Not the play's read",
      },
    ]);
    expect(step.resetRequested).toBe(true);
    expect(step.state.referee.outcome).toMatchObject({ kind: 'mistake', mistakeKind: 'offScript' });
  });

  it('a shot at entry is off script', () => {
    const s0 = start(GIVE_AND_GO, 1);
    const step = stepOnce(GIVE_AND_GO, s0, [{ type: 'shoot' }]);
    expect(step.refereeEvents).toEqual([
      { type: 'mistake', tick: s0.game.tick + 1, kind: 'offScript', reason: 'Off script' },
    ]);
    expect(step.resetRequested).toBe(true);
  });
});

describe('purity', () => {
  it('does not mutate its referee, before or after arguments', () => {
    const play = GIVE_AND_GO;
    let state = start(play, 1, scrimmage('ballWatch'));
    state = toFinish(play, state);
    const actionsList: SimAction[][] = [[passTo(state.game, 'SF')], [], [], []];
    for (let i = 0; i < 120; i += 1) {
      const actions = actionsList[i] ?? [];
      const next = stepPracticeRun(play, state.run, state.game, actions);
      const copy = structuredClone({
        referee: state.referee,
        before: state.game,
        after: next.game,
      });
      const ref = stepReferee(play, state.referee, {
        before: state.game,
        phaseId: state.run.phaseId,
        actions,
        after: next.game,
      });
      expect({ referee: state.referee, before: state.game, after: next.game }).toEqual(copy);
      state = { ...next, referee: ref.referee };
    }
    expect(state.referee.outcome).toMatchObject({ kind: 'success' });
  });
});
