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
import {
  ROLE_ORDER,
  SIM_HZ,
  type CourtPoint,
  type GameEvent,
  type GameState,
  type RoleId,
  type SimAction,
} from '../sim';
import {
  RESULT_HOLD_SECONDS,
  RESULT_HOLD_STEPS,
  quitRunController,
  restartRunController,
  startPracticeRun,
  startRunController,
  stepRunController,
  type RunControllerOptions,
  type RunControllerState,
  type RunControllerStep,
} from './index';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE_TEST: ModeConfig = {
  ...PRACTICE,
  id: 'scrimmageTest',
  rules: 'scrimmage',
  cueLevel: 'reduced',
  defense: 'cones',
};

const CUT_SPOT = { x: 0.8, z: -4 };

type ActionsFor = (c: RunControllerState) => SimAction[];

function options(seed = 1, extra: Partial<RunControllerOptions> = {}): RunControllerOptions {
  return { seed, ...SETUPS, ...extra };
}

function start(seed = 1, mode: ModeConfig = PRACTICE, extra: Partial<RunControllerOptions> = {}) {
  return startRunController(GIVE_AND_GO, mode, options(seed, extra));
}

function offense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`no offense ${role}`);
  return player;
}

function defense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'defense' && p.role === role);
  if (player === undefined) throw new Error(`no defense ${role}`);
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

function walkTo(spot: CourtPoint): ActionsFor {
  return (c) => [moveToward(c.game, spot)];
}

const inPhase = (phaseId: string) => (c: RunControllerState) => c.run.phaseId === phaseId;

function passTo(game: GameState, role: RoleId): SimAction {
  return { type: 'pass', passType: 'chestPass', targetId: offense(game, role).id };
}

interface Advanced {
  controller: RunControllerState;
  steps: RunControllerStep[];
}

/** Steps the controller up to `maxTicks` times, or until `stop` holds. */
function advance(
  controller: RunControllerState,
  maxTicks: number,
  actionsFor: ActionsFor,
  stop?: (c: RunControllerState) => boolean,
): Advanced {
  const steps: RunControllerStep[] = [];
  let current = controller;
  for (let ticks = 0; ticks < maxTicks; ticks += 1) {
    const step = stepRunController(GIVE_AND_GO, current, actionsFor(current));
    steps.push(step);
    current = step.controller;
    if (stop?.(current)) break;
  }
  return { controller: current, steps };
}

function stepOnce(controller: RunControllerState, actions: SimAction[]): RunControllerStep {
  return stepRunController(GIVE_AND_GO, controller, actions);
}

/** giveAndGo: entry pass, PG walks to the cut spot until the phase is 'finish' (PG holds). */
function toFinish(controller: RunControllerState): Advanced {
  const first = stepOnce(controller, [passTo(controller.game, 'SG')]);
  const atCut = advance(first.controller, 120, idle, inPhase('cut'));
  const walked = advance(atCut.controller, 1200, walkTo(CUT_SPOT), inPhase('finish'));
  expect(walked.controller.run.phaseId).toBe('finish');
  expect(walked.controller.referee.outcome).toBeNull();
  expect(walked.controller.status).toBe('playing');
  return { controller: walked.controller, steps: [first, ...atCut.steps, ...walked.steps] };
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** The controller is a fresh run at setup: positions, ball, phase and referee. */
function expectAtSetup(controller: RunControllerState, seed: number, runIndex: number) {
  const { game, run, referee } = controller;
  expect(controller.status).toBe('playing');
  expect(controller.runIndex).toBe(runIndex);
  expect(controller.resultStepsLeft).toBe(0);
  const fresh = startPracticeRun(GIVE_AND_GO, { seed: seed + runIndex, ...SETUPS });
  for (const role of ROLE_ORDER) {
    expect(offense(game, role).pos).toEqual(GIVE_AND_GO.setup.positions[role]);
    expect(defense(game, role).pos).toEqual(defense(fresh.game, role).pos);
  }
  expect(game).toEqual(fresh.game);
  expect(game.ball).toEqual({
    kind: 'held',
    holderId: offense(game, GIVE_AND_GO.setup.ballHolder).id,
  });
  expect(run.phaseId).toBe(GIVE_AND_GO.phases[0]?.id);
  expect(referee.outcome).toBeNull();
}

const SEEDS = [1, 2, 3, 4, 5];

describe('RESULT_HOLD_STEPS', () => {
  it('is the hold seconds in sim steps', () => {
    expect(RESULT_HOLD_STEPS).toBe(Math.round(RESULT_HOLD_SECONDS * SIM_HZ));
    expect(RESULT_HOLD_STEPS).toBeGreaterThan(1);
  });
});

describe('startRunController', () => {
  it('starts run 0 at setup, playing', () => {
    const c = start(1);
    expectAtSetup(c, 1, 0);
    expect(c.playId).toBe('giveAndGo');
    expect(c.mode).toEqual(PRACTICE);
    expect(c.referee).toMatchObject({ mode: 'practice', coverageId: GIVE_AND_GO.practiceCoverage });
  });

  it('throws for a Scrimmage config without a coverage', () => {
    expect(() => start(1, SCRIMMAGE_TEST)).toThrow(/Court Vision:/);
  });

  it('stepRunController throws for another play', () => {
    const c = start(1);
    expect(() => stepRunController({ ...GIVE_AND_GO, id: 'other' }, c, [])).toThrow(
      /Court Vision: run controller is for play giveAndGo, got play other/,
    );
  });
});

describe('Acceptance: a mistake resets on the next step', () => {
  it.each(SEEDS)('seed %i: wrong teammate at entry', (seed) => {
    const c0 = start(seed);
    const mistake = stepOnce(c0, [passTo(c0.game, 'SF')]);
    expect(mistake.controller.status).toBe('resetPending');
    expect(mistake.reset).toBe(false);
    expect(mistake.attempt).toMatchObject({
      success: false,
      modeId: 'practice',
      playId: 'giveAndGo',
      outcome: { kind: 'mistake' },
    });
    expect(ofType(mistake.events, 'mistake')).toHaveLength(1);

    const reset = stepOnce(mistake.controller, []);
    expect(reset.reset).toBe(true);
    expect(reset.attempt).toBeNull();
    expect(reset.events).toEqual([]);
    expectAtSetup(reset.controller, seed, 1);
  });

  it('wrong teammate at finish resets the same way', () => {
    const atFinish = toFinish(start(1)).controller;
    const mistake = stepOnce(atFinish, [passTo(atFinish.game, 'SG')]);
    expect(mistake.controller.status).toBe('resetPending');
    expect(mistake.attempt).toMatchObject({
      success: false,
      outcome: { kind: 'mistake', mistakeKind: 'wrongTeammate' },
    });
    const reset = stepOnce(mistake.controller, [passTo(mistake.controller.game, 'SG')]);
    expect(reset.reset).toBe(true);
    expect(reset.attempt).toBeNull();
    expectAtSetup(reset.controller, 1, 1);
  });
});

describe('success holds the result, then resets', () => {
  it('shows the result for RESULT_HOLD_STEPS steps with a frozen frame', () => {
    const atFinish = toFinish(start(1));
    const shot = stepOnce(atFinish.controller, [{ type: 'shoot' }]);
    expect(shot.attempt).toMatchObject({
      success: true,
      modeId: 'practice',
      playId: 'giveAndGo',
      outcome: { kind: 'success' },
    });
    expect(ofType(shot.events, 'runSuccess')).toHaveLength(1);
    expect(shot.controller.status).toBe('showingResult');
    expect(shot.controller.resultStepsLeft).toBe(RESULT_HOLD_STEPS);

    const hold = advance(shot.controller, RESULT_HOLD_STEPS - 1, () => [{ type: 'shoot' }]);
    expect(hold.steps).toHaveLength(RESULT_HOLD_STEPS - 1);
    for (const step of hold.steps) {
      expect(step.reset).toBe(false);
      expect(step.attempt).toBeNull();
      expect(step.events).toEqual([]);
      expect(step.controller.status).toBe('showingResult');
      expect(step.controller.game).toBe(shot.controller.game);
    }
    expect(hold.controller.resultStepsLeft).toBe(1);

    const reset = stepOnce(hold.controller, []);
    expect(reset.reset).toBe(true);
    expect(reset.attempt).toBeNull();
    expectAtSetup(reset.controller, 1, 1);

    // Exactly one attempt across the whole run: playing, end step, hold and reset.
    const all = [...atFinish.steps, shot, ...hold.steps, reset];
    expect(all.filter((s) => s.attempt !== null)).toHaveLength(1);
  });
});

describe('an unsuccessful run counts as a failed attempt', () => {
  it('Scrimmage rules, helpOnCut: a shot at finish is unsuccessful and shows the result', () => {
    const c0 = start(1, SCRIMMAGE_TEST, { coverageId: 'helpOnCut' });
    expect(c0.referee).toMatchObject({ mode: 'scrimmage', coverageId: 'helpOnCut' });
    const atFinish = toFinish(c0).controller;
    const shot = stepOnce(atFinish, [{ type: 'shoot' }]);
    expect(shot.attempt).toMatchObject({
      success: false,
      modeId: 'scrimmageTest',
      outcome: { kind: 'unsuccessful' },
    });
    expect(ofType(shot.events, 'runUnsuccessful')).toHaveLength(1);
    expect(ofType(shot.events, 'mistake')).toEqual([]);
    expect(shot.controller.status).toBe('showingResult');
    expect(shot.controller.resultStepsLeft).toBe(RESULT_HOLD_STEPS);
  });
});

describe('quit and restart never produce an attempt', () => {
  it('restart mid-run returns to setup at the next run index', () => {
    const mid = advance(start(3), 30, walkTo({ x: 0, z: 2 })).controller;
    expect(mid.game.tick).toBe(30);
    const restarted = restartRunController(GIVE_AND_GO, mid);
    expectAtSetup(restarted, 3, 1);
  });

  it('restart while showing a result skips the hold', () => {
    const atFinish = toFinish(start(1)).controller;
    const shot = stepOnce(atFinish, [{ type: 'shoot' }]);
    expect(shot.controller.status).toBe('showingResult');
    const restarted = restartRunController(GIVE_AND_GO, shot.controller);
    expectAtSetup(restarted, 1, 1);
    const next = stepOnce(restarted, []);
    expect(next.attempt).toBeNull();
    expect(next.reset).toBe(false);
    expect(next.controller.game.tick).toBe(1);
  });

  it('restart while a reset is pending starts the next run without an attempt', () => {
    const c0 = start(1);
    const mistake = stepOnce(c0, [passTo(c0.game, 'SF')]);
    const restarted = restartRunController(GIVE_AND_GO, mistake.controller);
    expectAtSetup(restarted, 1, 1);
  });

  it('after quit, step and restart throw', () => {
    const mid = advance(start(1), 10, idle).controller;
    const quit = quitRunController(mid);
    expect(quit.status).toBe('quit');
    expect(quit.game).toBe(mid.game);
    expect(() => stepRunController(GIVE_AND_GO, quit, [])).toThrow(/Court Vision:/);
    expect(() => restartRunController(GIVE_AND_GO, quit)).toThrow(/Court Vision:/);
  });
});

describe('mode config wiring', () => {
  it('a cueLevel none config starts and steps', () => {
    const drill: ModeConfig = { ...PRACTICE, id: 'drill', cueLevel: 'none' };
    const c0 = start(1, drill);
    const step = stepOnce(c0, []);
    expect(step.controller.status).toBe('playing');
    expect(step.controller.game.tick).toBe(1);
    const mistake = stepOnce(c0, [passTo(c0.game, 'SF')]);
    expect(mistake.attempt?.modeId).toBe('drill');
  });

  it('shotClockSeconds reaches the game', () => {
    const timed = start(1, { ...PRACTICE, id: 'timed', shotClockSeconds: 24 });
    expect(timed.game.shotClockTicks).toBe(24 * SIM_HZ);
    expect(start(1).game.shotClockTicks).toBeNull();
  });

  it('live defense under Practice rules runs the standard coverage', () => {
    const live = start(1, { ...PRACTICE, id: 'liveDrill', defense: 'live' });
    expect(live.run.liveDefense?.coverageId).toBe(GIVE_AND_GO.practiceCoverage);
    expect(live.game.defenseMode).toBe('live');
    expect(start(1).run.liveDefense).toBeNull();
  });

  it('live defense under Scrimmage rules runs the given coverage', () => {
    const live = start(1, { ...SCRIMMAGE_TEST, defense: 'live' }, { coverageId: 'helpOnCut' });
    expect(live.run.liveDefense?.coverageId).toBe('helpOnCut');
    expect(live.referee.coverageId).toBe('helpOnCut');
  });

  it('cones under Scrimmage rules use the Practice standard cone spots', () => {
    const c = start(1, SCRIMMAGE_TEST, { coverageId: 'helpOnCut' });
    const fresh = startPracticeRun(GIVE_AND_GO, { seed: 1, ...SETUPS });
    expect(c.run.liveDefense).toBeNull();
    expect(c.game).toEqual(fresh.game);
  });

  it('each run uses the next seed', () => {
    const c0 = start(7);
    expect(c0.game.seed).toBe(7);
    const c1 = restartRunController(GIVE_AND_GO, c0);
    expect(c1.game.seed).toBe(8);
  });
});

describe('purity', () => {
  it('does not mutate its controller or actions across a full run', () => {
    let controller = start(1, SCRIMMAGE_TEST, { coverageId: 'ballWatch' });
    const sequence: ActionsFor[] = [];
    const flow = toFinish(controller);
    controller = flow.controller;
    sequence.push(() => [{ type: 'shoot' }]);
    for (let i = 0; i < RESULT_HOLD_STEPS + 2; i += 1) sequence.push(idle);
    for (const actionsFor of sequence) {
      const actions = actionsFor(controller);
      const copy = structuredClone({ controller, actions });
      const step = stepRunController(GIVE_AND_GO, controller, actions);
      expect({ controller, actions }).toEqual(copy);
      controller = step.controller;
    }
    expect(controller.runIndex).toBe(1);
  });

  it('is deterministic', () => {
    const a = toFinish(start(4)).steps.map((s) => s.events);
    const b = toFinish(start(4)).steps.map((s) => s.events);
    expect(a).toEqual(b);
  });
});
