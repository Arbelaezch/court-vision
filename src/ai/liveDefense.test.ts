import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import {
  BASELINE_Z,
  FIXED_DT,
  HALF_COURT_LINE_Z,
  SIDELINE_X,
  type CourtPoint,
  type GameState,
  type RoleId,
  type SimAction,
} from '../sim';
import { isInKey, startPracticeRun, stepPracticeRun, type PlayRunState } from './index';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const MOVEMENT = loadSimMovement();
const SETUPS = {
  movement: MOVEMENT,
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SEEDS = [1, 2, 3, 4, 5];
const CUT_SPOT = { x: 0.8, z: -4 };
const ROLES: readonly RoleId[] = ['PG', 'SG', 'SF', 'PF', 'C'];

interface Run {
  game: GameState;
  run: PlayRunState;
}

function player(game: GameState, side: 'offense' | 'defense', role: RoleId) {
  const p = game.players.find((q) => q.side === side && q.role === role);
  if (p === undefined) throw new Error(`no ${side} ${role}`);
  return p;
}

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

interface CutRun {
  reachedCut: boolean;
  /** Defense positions on the step the phase changed from cut to finish; null if it never did. */
  atFinish: CourtPoint[] | null;
  maxStep: number;
  /** True when any defender stood on the sim's wall clamp at any tick. */
  wallContact: boolean;
  debug?: string;
}

function runCut(seed: number, liveCoverageId: string): CutRun {
  let state: Run = startPracticeRun(GIVE_AND_GO, { seed, ...SETUPS, liveCoverageId });
  const sgId = player(state.game, 'offense', 'SG').id;
  const mistakes: string[] = [];
  const out: CutRun = { reachedCut: false, atFinish: null, maxStep: -Infinity, wallContact: false };
  for (let tick = 0; tick < 1200; tick += 1) {
    const actions: SimAction[] =
      tick === 0
        ? [{ type: 'pass', passType: 'chestPass', targetId: sgId }]
        : [moveToward(state.game, CUT_SPOT)];
    const prev = state;
    state = stepPracticeRun(GIVE_AND_GO, prev.run, prev.game, actions);
    if (state.run.phaseId === 'cut') out.reachedCut = true;
    for (const e of state.game.events) if (e.type === 'mistake') mistakes.push(JSON.stringify(e));
    for (const role of ROLES) {
      const before = player(prev.game, 'defense', role);
      const after = player(state.game, 'defense', role);
      const limit =
        before.movement.speedMps * state.game.movementTuning.sprintSpeedMultiplier * FIXED_DT;
      const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
      out.maxStep = Math.max(out.maxStep, moved - limit);
      if (
        after.pos.z <= BASELINE_Z ||
        after.pos.z >= HALF_COURT_LINE_Z ||
        Math.abs(after.pos.x) >= SIDELINE_X
      ) {
        out.wallContact = true;
      }
    }
    if (prev.run.phaseId === 'cut' && state.run.phaseId === 'finish') {
      out.atFinish = ROLES.map((r) => ({ ...player(state.game, 'defense', r).pos }));
      break;
    }
  }
  const pg = player(state.game, 'offense', 'PG');
  out.debug = JSON.stringify({
    phase: state.run.phaseId,
    deviated: state.run.deviated,
    ball: state.game.ball,
    pg: pg.pos,
    passes: state.run.passesMade,
    defense: ROLES.map((r) => [
      r,
      player(state.game, 'defense', r).id,
      player(state.game, 'defense', r).pos,
    ]),
    sg: player(state.game, 'offense', 'SG').pos,
    mistakes: mistakes,
  });
  return out;
}

interface KickOut {
  intercepted: boolean;
  sfHasBall: boolean;
  debug: string;
}

/** Run entry and cut to the finish, then kick out to the SF with a chest pass. */
function runKickOut(seed: number, liveCoverageId: string): KickOut {
  let state: Run = startPracticeRun(GIVE_AND_GO, { seed, ...SETUPS, liveCoverageId });
  const sgId = player(state.game, 'offense', 'SG').id;
  const sfId = player(state.game, 'offense', 'SF').id;
  let kicked = false;
  let kickTicks = 0;
  for (let tick = 0; tick < 1500 && kickTicks < 120; tick += 1) {
    let actions: SimAction[];
    if (tick === 0) actions = [{ type: 'pass', passType: 'chestPass', targetId: sgId }];
    else if (state.run.phaseId === 'finish' && !kicked) {
      const holder = state.game.ball.kind === 'held' ? state.game.ball.holderId : -1;
      const pgId = player(state.game, 'offense', 'PG').id;
      if (holder === pgId) {
        actions = [{ type: 'pass', passType: 'chestPass', targetId: sfId }];
        kicked = true;
      } else {
        actions = [moveToward(state.game, CUT_SPOT)];
      }
    } else {
      actions = [moveToward(state.game, CUT_SPOT)];
    }
    state = stepPracticeRun(GIVE_AND_GO, state.run, state.game, actions);
    if (kicked) kickTicks += 1;
  }
  const events = JSON.stringify(state.game.events);
  return {
    intercepted: state.game.events.some((e) => e.type === 'mistake'),
    sfHasBall: state.game.ball.kind === 'held' && state.game.ball.holderId === sfId,
    debug: JSON.stringify({ kicked, phase: state.run.phaseId, ball: state.game.ball, events }),
  };
}

describe('live defense in the play run', () => {
  it('helpOnCut: the SF help defender is in the key when the cut becomes the finish (AC4)', () => {
    for (const seed of SEEDS) {
      const result = runCut(seed, 'helpOnCut');
      expect(result.reachedCut).toBe(true);
      expect(result.atFinish, result.debug).not.toBeNull();
      const sfPos = result.atFinish?.[ROLES.indexOf('SF')];
      expect(sfPos !== undefined && isInKey(sfPos)).toBe(true);
    }
  });

  it('ballWatch contrast: nobody on defense is in the key at the finish', () => {
    for (const seed of SEEDS) {
      const result = runCut(seed, 'ballWatch');
      expect(result.atFinish).not.toBeNull();
      expect(result.atFinish?.some((p) => isInKey(p))).toBe(false);
    }
  });

  it('never reaches a wall: live defenders stay off the sim clamp through the cut', () => {
    for (const coverage of ['ballWatch', 'helpOnCut']) {
      for (const seed of SEEDS) {
        const result = runCut(seed, coverage);
        expect(result.atFinish).not.toBeNull();
        expect(result.wallContact).toBe(false);
      }
    }
  });

  it('the SG -> PG return pass completes against the guarding SG, in both coverages', () => {
    for (const coverage of ['ballWatch', 'helpOnCut']) {
      for (const seed of SEEDS) {
        const result = runCut(seed, coverage);
        expect(result.atFinish, result.debug).not.toBeNull();
      }
    }
  });

  it('helpOnCut: the great kick-out read to the SF is not intercepted', () => {
    for (const seed of SEEDS) {
      const outcome = runKickOut(seed, 'helpOnCut');
      expect(outcome.intercepted, outcome.debug).toBe(false);
      expect(outcome.sfHasBall, outcome.debug).toBe(true);
    }
  });

  it('never places defenders: per-tick displacement stays within sprint top speed', () => {
    for (const seed of SEEDS) {
      const { maxStep } = runCut(seed, 'helpOnCut');
      // maxStep is the largest per-tick displacement minus that player's sprint limit.
      expect(maxStep).toBeLessThanOrEqual(1e-9);
    }
  });

  it('sets the defense mode and live state only with liveCoverageId', () => {
    const live = startPracticeRun(GIVE_AND_GO, {
      seed: 1,
      ...SETUPS,
      liveCoverageId: 'helpOnCut',
    });
    expect(live.game.defenseMode).toBe('live');
    expect(live.run.liveDefense?.coverageId).toBe('helpOnCut');
    const cones = startPracticeRun(GIVE_AND_GO, { seed: 1, ...SETUPS });
    expect(cones.game.defenseMode).toBe('cones');
    expect(cones.run.liveDefense).toBeNull();
  });

  it('throws for an unknown coverage', () => {
    expect(() =>
      startPracticeRun(GIVE_AND_GO, { seed: 1, ...SETUPS, liveCoverageId: 'nope' }),
    ).toThrow(/Court Vision:/);
  });

  it('no steals: the dribbling PG keeps the ball for 600 ticks with no mistake', () => {
    let state: Run = startPracticeRun(GIVE_AND_GO, {
      seed: 1,
      ...SETUPS,
      liveCoverageId: 'helpOnCut',
    });
    const pgId = player(state.game, 'offense', 'PG').id;
    for (let tick = 0; tick < 600; tick += 1) {
      const target = Math.floor(tick / 150) % 2 === 0 ? { x: 0, z: -4 } : { x: 0, z: 2.5 };
      state = stepPracticeRun(GIVE_AND_GO, state.run, state.game, [moveToward(state.game, target)]);
      expect(state.game.ball).toEqual({ kind: 'held', holderId: pgId });
      expect(state.game.events.some((e) => e.type === 'mistake')).toBe(false);
    }
  });
});
