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
  SIM_HZ,
  type CourtPoint,
  type GameEvent,
  type GameState,
  type RoleId,
  type SimAction,
} from '../sim';
import {
  REACHED_SPOT_RADIUS_M,
  startPracticeRun,
  stepPracticeRun,
  type PlayRunState,
} from './index';
import { SCREEN_TEST_PLAY_DATA, SCREEN_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const SCREEN_TEST_SOURCE = { file: SCREEN_TEST_PLAY_FILE, data: SCREEN_TEST_PLAY_DATA };
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SCREEN_TEST = loadScenario(SCREEN_TEST_SOURCE, roles);
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const ROLES: readonly RoleId[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const CUT_SPOT = { x: 0.8, z: -4 };
const WALK_UP_SPOT = { x: 0, z: 2 };
const SCREEN_SPOT = { x: 1.3, z: 2.4 };

interface Run {
  game: GameState;
  run: PlayRunState;
}

interface ScreenStep {
  tick: number;
  phaseId: string;
  cPos: CourtPoint;
}

type ActionsFor = (state: Run) => SimAction[];

function start(play: PlayScenario, seed = 1): Run {
  return startPracticeRun(play, { seed, ...SETUPS });
}

function offense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`no offense ${role}`);
  return player;
}

function cone(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'defense' && p.role === role);
  if (player === undefined) throw new Error(`no cone ${role}`);
  return player;
}

function dist(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function roleAt(game: GameState, role: RoleId, spot: CourtPoint): boolean {
  return dist(offense(game, role).pos, spot) <= REACHED_SPOT_RADIUS_M;
}

function holderId(game: GameState): number | null {
  return game.ball.kind === 'held' ? game.ball.holderId : null;
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

/**
 * Steps up to `maxTicks` times (or until `stop` holds after a step), calling `onStep` with the
 * previous and new state. Returns the final state, every event and every action sent.
 */
function advance(
  play: PlayScenario,
  state: Run,
  maxTicks: number,
  actionsFor: ActionsFor,
  options: { stop?: (s: Run) => boolean; onStep?: (prev: Run, s: Run) => void } = {},
): { state: Run; events: GameEvent[]; actions: SimAction[]; ticks: number } {
  const events: GameEvent[] = [];
  const actions: SimAction[] = [];
  let current = state;
  let ticks = 0;
  while (ticks < maxTicks) {
    const sent = actionsFor(current);
    actions.push(...sent);
    const next = stepPracticeRun(play, current.run, current.game, sent);
    ticks += 1;
    events.push(...next.game.events);
    options.onStep?.(current, next);
    current = next;
    if (options.stop?.(current)) break;
  }
  return { state: current, events, actions, ticks };
}

const inPhase = (phaseId: string) => (s: Run) => s.run.phaseId === phaseId;

/** The tick of the step on which the phase became `phaseId`, or null. */
function entered(prev: Run, s: Run, phaseId: string): number | null {
  return prev.run.phaseId !== phaseId && s.run.phaseId === phaseId ? s.game.tick : null;
}

/** giveAndGo: entry pass to SG, then steps until the phase is 'cut'. */
function entryPassToCut(play: PlayScenario, seed: number): Run {
  const s0 = start(play, seed);
  const sgId = offense(s0.game, 'SG').id;
  const first = stepPracticeRun(play, s0.run, s0.game, [
    { type: 'pass', passType: 'chestPass', targetId: sgId },
  ]);
  return advance(play, first, 120, idle, { stop: inPhase('cut') }).state;
}

describe('screenTest fixture', () => {
  it('loads through loadScenario', () => {
    const load = () => loadScenario(SCREEN_TEST_SOURCE, roles);
    expect(load).not.toThrow();
    expect(SCREEN_TEST.id).toBe('screenTest');
    expect(SCREEN_TEST.practiceCoverage).toBe('standard');
  });
});

describe('startPracticeRun', () => {
  it('builds the Practice game from the play setup', () => {
    const { game, run } = start(SCREEN_TEST);
    for (const role of ROLES) {
      expect(offense(game, role).pos).toEqual(SCREEN_TEST.setup.positions[role]);
    }
    expect(game.controlledPlayerId).toBe(offense(game, 'PG').id);
    expect(holderId(game)).toBe(offense(game, 'PG').id);
    expect(run).toMatchObject({
      playId: 'screenTest',
      humanRole: 'PG',
      phaseId: 'walkUp',
      phaseStartTick: 0,
      screensSet: [],
      passesMade: [],
    });
    expect(run.activeSteps.C?.action).toBe('space');
  });

  it('throws for a human role that is not playable', () => {
    const startAsSg = () => startPracticeRun(SCREEN_TEST, { seed: 1, ...SETUPS, humanRole: 'SG' });
    expect(startAsSg).toThrow(/Court Vision: humanRole/);
  });

  it('passes shotClockSeconds through to the game; omitted means no shot clock', () => {
    const timed = startPracticeRun(GIVE_AND_GO, { seed: 1, ...SETUPS, shotClockSeconds: 24 });
    expect(timed.game.shotClockTicks).toBe(24 * SIM_HZ);
    const untimed = startPracticeRun(GIVE_AND_GO, { seed: 1, ...SETUPS, shotClockSeconds: null });
    expect(untimed.game.shotClockTicks).toBeNull();
    expect(start(GIVE_AND_GO).game.shotClockTicks).toBeNull();
  });
});

describe('AC1: phases advance on triggers, never on a hidden timer', () => {
  it.each(SEEDS)('giveAndGo seed %i: SG passes back only after the PG cuts', (seed) => {
    const play = GIVE_AND_GO;
    const s0 = start(play, seed);
    const sgId = offense(s0.game, 'SG').id;
    const pgId = offense(s0.game, 'PG').id;

    const first = stepPracticeRun(play, s0.run, s0.game, [
      { type: 'pass', passType: 'chestPass', targetId: sgId },
    ]);
    expect(first.game.ball).toMatchObject({ kind: 'inFlight', fromId: pgId, targetId: sgId });

    const toCut = advance(play, first, 120, idle, { stop: inPhase('cut') });
    expect(toCut.state.run.phaseId).toBe('cut');
    expect(holderId(toCut.state.game)).toBe(sgId);

    const idled = advance(play, toCut.state, 1200, idle, {
      onStep: (_prev, s) => {
        expect(s.run.phaseId).toBe('cut');
        expect(holderId(s.game)).toBe(sgId);
      },
    });
    expect(idled.ticks).toBe(1200);
    expect(idled.state.run.passesMade).toEqual([]);
    expect(idled.events.filter((e) => e.type === 'passCompleted')).toEqual([]);

    let reachedTick: number | null = null;
    let finishTick: number | null = null;
    const walked = advance(play, idled.state, 1200, walkTo(CUT_SPOT), {
      stop: inPhase('finish'),
      onStep: (prev, s) => {
        if (reachedTick === null && roleAt(s.game, 'PG', CUT_SPOT)) reachedTick = s.game.tick;
        finishTick ??= entered(prev, s, 'finish');
      },
    });
    expect(walked.state.run.phaseId).toBe('finish');
    expect(holderId(walked.state.game)).toBe(pgId);
    expect(walked.events).toContainEqual(
      expect.objectContaining({ type: 'passCompleted', passerId: sgId, receiverId: pgId }),
    );
    expect(reachedTick).not.toBeNull();
    expect(finishTick).not.toBeNull();
    expect(finishTick as unknown as number).toBeGreaterThan(reachedTick as unknown as number);
  });

  it('screenTest: walkUp waits for the PG and advances the step it reaches the spot', () => {
    const play = SCREEN_TEST;
    const s0 = start(play);

    const idled = advance(play, s0, 1200, idle, {
      onStep: (_prev, s) => expect(s.run.phaseId).toBe('walkUp'),
    });
    expect(idled.state.run.phaseId).toBe('walkUp');

    let firstWithin: number | null = null;
    let screenTick: number | null = null;
    advance(play, idled.state, 1200, walkTo(WALK_UP_SPOT), {
      stop: inPhase('screen'),
      onStep: (prev, s) => {
        if (firstWithin === null && roleAt(s.game, 'PG', WALK_UP_SPOT)) firstWithin = s.game.tick;
        screenTick ??= entered(prev, s, 'screen');
        if (firstWithin === null) expect(s.run.phaseId).toBe('walkUp');
      },
    });
    expect(firstWithin).not.toBeNull();
    expect(screenTick).toBe(firstWithin);
  });

  it('screenTest: SG walks to its spot and SF and PF hold theirs during walkUp', () => {
    const play = SCREEN_TEST;
    const result = advance(play, start(play), 1200, idle, {
      onStep: (_prev, s) => {
        expect(roleAt(s.game, 'SF', play.setup.positions.SF)).toBe(true);
        expect(roleAt(s.game, 'PF', play.setup.positions.PF)).toBe(true);
      },
    });
    expect(roleAt(result.state.game, 'SG', { x: 4, z: 1 })).toBe(true);
  });
});

describe('AC2: screens are set automatically', () => {
  it('screenTest: C sets the screen with no screen input, then roll and finish follow', () => {
    const play = SCREEN_TEST;
    const s0 = start(play);
    const cId = offense(s0.game, 'C').id;
    const pgId = offense(s0.game, 'PG').id;

    const walked = advance(play, s0, 1200, walkTo(WALK_UP_SPOT), { stop: inPhase('screen') });
    expect(walked.state.run.phaseId).toBe('screen');

    let screenStep: ScreenStep | null = null;
    let rollTick: number | null = null;
    let finishTick: number | null = null;
    const rest = advance(play, walked.state, 1200, standStill, {
      stop: inPhase('finish'),
      onStep: (prev, s) => {
        if (s.game.events.some((e) => e.type === 'screenSet')) {
          const cPos = offense(s.game, 'C').pos;
          screenStep = { tick: s.game.tick, phaseId: s.run.phaseId, cPos };
        }
        rollTick ??= entered(prev, s, 'roll');
        finishTick ??= entered(prev, s, 'finish');
      },
    });

    const actions = [...walked.actions, ...rest.actions];
    expect(actions.every((a) => a.type === 'move')).toBe(true);

    const screens = [...walked.events, ...rest.events].filter((e) => e.type === 'screenSet');
    expect(screens).toEqual([
      { type: 'screenSet', tick: expect.any(Number), screenerId: cId, targetId: pgId },
    ]);
    expect(screenStep).not.toBeNull();
    const step = screenStep as unknown as ScreenStep;
    expect(dist(step.cPos, SCREEN_SPOT)).toBeLessThanOrEqual(REACHED_SPOT_RADIUS_M);
    expect(screens[0]?.tick).toBe(step.tick);
    expect(step.phaseId).toBe('roll');
    expect(rollTick).toBe(step.tick);
    expect(rest.state.run.phaseId).toBe('finish');
    expect((finishTick as unknown as number) - step.tick).toBe(Math.round(1 * SIM_HZ));
  });

  it('screenTest: a carried-over setScreen step sets no second screen in later phases', () => {
    const data: any = structuredClone(SCREEN_TEST_PLAY_DATA);
    data.tracks.C = data.tracks.C.filter((s: any) => s.phase !== 'roll');
    const play = loadScenario({ file: SCREEN_TEST_PLAY_FILE, data }, roles);
    const s0 = start(play);

    const walked = advance(play, s0, 1200, walkTo(WALK_UP_SPOT), { stop: inPhase('screen') });
    expect(walked.state.run.phaseId).toBe('screen');
    const toFinish = advance(play, walked.state, 1200, standStill, { stop: inPhase('finish') });
    expect(toFinish.state.run.phaseId).toBe('finish');
    expect(toFinish.state.run.activeSteps.C?.action).toBe('setScreen');
    const after = advance(play, toFinish.state, 300, standStill);

    const screens = [...walked.events, ...toFinish.events, ...after.events].filter(
      (e) => e.type === 'screenSet',
    );
    expect(screens).toHaveLength(1);
    expect(after.state.run.screensSet).toEqual([]);
  });
});

describe('carried-over pass steps and decision passes', () => {
  /** giveAndGo: entry pass, PG walks to the cut spot until the phase is 'finish' (PG holds). */
  function toFinish(play: PlayScenario, seed: number): Run {
    const atCut = entryPassToCut(play, seed);
    const walked = advance(play, atCut, 1200, walkTo(CUT_SPOT), { stop: inPhase('finish') });
    expect(walked.state.run.phaseId).toBe('finish');
    return walked.state;
  }

  it.each(SEEDS)('giveAndGo seed %i: kickToWing in finish keeps the run on script', (seed) => {
    const play = GIVE_AND_GO;
    const atFinish = toFinish(play, seed);
    const sfId = offense(atFinish.game, 'SF').id;
    const first = stepPracticeRun(play, atFinish.run, atFinish.game, [
      { type: 'pass', passType: 'chestPass', targetId: sfId },
    ]);
    const settled = advance(play, first, 240, standStill, {
      stop: (s) => s.game.ball.kind === 'held',
    });
    expect([...first.game.events, ...settled.events]).toContainEqual(
      expect.objectContaining({ type: 'passCompleted', receiverId: sfId }),
    );
    expect(holderId(settled.state.game)).toBe(sfId);
    expect(settled.state.run.deviated).toBe(false);
    expect(settled.state.run.phaseId).toBe('finish');
  });

  it('giveAndGo: SG does not repeat its carried cut-phase pass after getting the ball in finish', () => {
    const data: any = structuredClone(GIVE_AND_GO_DATA);
    data.decisions[0].options.push({
      id: 'swingBack',
      move: 'chestPass',
      target: 'SG',
      grades: { ballWatch: 'bad', helpOnCut: 'bad' },
    });
    const play = loadScenario({ file: GIVE_AND_GO_FILE, data }, roles);
    const atFinish = toFinish(play, 1);
    const sgId = offense(atFinish.game, 'SG').id;
    expect(atFinish.run.activeSteps.SG).toMatchObject({ phase: 'cut', action: 'pass' });

    const first = stepPracticeRun(play, atFinish.run, atFinish.game, [
      { type: 'pass', passType: 'chestPass', targetId: sgId },
    ]);
    const after = advance(play, first, 600, standStill);
    expect(after.state.run.deviated).toBe(false);
    expect(holderId(after.state.game)).toBe(sgId);
    expect(after.events.filter((e) => e.type === 'passCompleted' && e.passerId === sgId)).toEqual(
      [],
    );
    expect(after.state.run.passesMade).toEqual([]);
    // PG stands at its finish spot, so only the phase check keeps SG from passing back.
    expect(roleAt(after.state.game, 'PG', CUT_SPOT)).toBe(true);
  });
});

describe('AC3: Practice cones follow the standard script and never interact', () => {
  const ballWatch = GIVE_AND_GO.coverages.find((c) => c.id === 'ballWatch');
  const entry = ballWatch?.script.find((s) => s.phase === 'entry');

  it('starts in cones mode with cones at the ballWatch entry spots', () => {
    const { game } = start(GIVE_AND_GO);
    expect(game.defenseMode).toBe('cones');
    expect(entry).toBeDefined();
    for (const role of ROLES) {
      expect(cone(game, role).pos).toEqual(entry?.defenders[role].spot);
    }
  });

  it('moves the PG cone one step after the phase becomes cut', () => {
    const atCut = entryPassToCut(GIVE_AND_GO, 1);
    expect(atCut.run.phaseId).toBe('cut');
    const after = stepPracticeRun(GIVE_AND_GO, atCut.run, atCut.game, []);
    expect(cone(after.game, 'PG').pos).toEqual({ x: 1.5, z: 0.5 });
    for (const role of ROLES.filter((r) => r !== 'PG')) {
      expect(cone(after.game, role).pos).toEqual(entry?.defenders[role].spot);
    }
  });

  it.each(SEEDS)('seed %i: an on-script run has no mistake and no block', (seed) => {
    const play = GIVE_AND_GO;
    const atCut = entryPassToCut(play, seed);
    const walked = advance(play, atCut, 1200, walkTo(CUT_SPOT), { stop: inPhase('finish') });
    expect(walked.state.run.phaseId).toBe('finish');
    const shot = stepPracticeRun(play, walked.state.run, walked.state.game, [{ type: 'shoot' }]);
    const events = [...walked.events, ...shot.game.events];
    expect(events.filter((e) => e.type === 'mistake')).toEqual([]);
    const resolved = shot.game.events.filter((e) => e.type === 'shotResolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ blockerId: null });
  });

  it.each(SEEDS)('seed %i: a cone scripted onto the entry lane does not intercept', (seed) => {
    const data: any = structuredClone(GIVE_AND_GO_DATA);
    data.coverages[0].script[0].defenders.PG.spot = { x: 2.75, z: 0.75 };
    const play = loadScenario({ file: GIVE_AND_GO_FILE, data }, roles);
    const s0 = start(play, seed);
    expect(cone(s0.game, 'PG').pos).toEqual({ x: 2.75, z: 0.75 });
    const sgId = offense(s0.game, 'SG').id;
    const first = stepPracticeRun(play, s0.run, s0.game, [
      { type: 'pass', passType: 'chestPass', targetId: sgId },
    ]);
    const settled = advance(play, first, 120, idle, {
      stop: (s) => s.game.ball.kind === 'held',
    });
    const events = [...first.game.events, ...settled.events];
    expect(events.filter((e) => e.type === 'mistake')).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'passCompleted', receiverId: sgId }),
    );
    expect(holderId(settled.state.game)).toBe(sgId);
  });
});

describe('determinism and purity', () => {
  function scriptedRun(seed: number): Run {
    const atCut = entryPassToCut(GIVE_AND_GO, seed);
    return advance(GIVE_AND_GO, atCut, 600, walkTo(CUT_SPOT)).state;
  }

  it('gives deep-equal game and run for the same seed and inputs', () => {
    expect(scriptedRun(7)).toEqual(scriptedRun(7));
  });

  it('does not mutate its inputs', () => {
    const play = SCREEN_TEST;
    const playBefore = structuredClone(play);
    let state = start(play);
    for (let i = 0; i < 400; i += 1) {
      const actions = [moveToward(state.game, WALK_UP_SPOT)];
      const before = structuredClone({ ...state, actions });
      const next = stepPracticeRun(play, state.run, state.game, actions);
      expect({ ...state, actions }).toEqual(before);
      state = next;
    }
    expect(state.run.phaseId).not.toBe('walkUp');
    expect(play).toEqual(playBefore);
  });
});
