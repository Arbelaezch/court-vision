import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import { FIXED_DT, type CourtPoint, type GameState, type RoleId, type SimAction } from '../sim';
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
  debug?: string;
}

function runCut(seed: number, liveCoverageId: string): CutRun {
  let state: Run = startPracticeRun(GIVE_AND_GO, { seed, ...SETUPS, liveCoverageId });
  const sgId = player(state.game, 'offense', 'SG').id;
  const out: CutRun = { reachedCut: false, atFinish: null, maxStep: -Infinity };
  for (let tick = 0; tick < 1200; tick += 1) {
    const actions: SimAction[] =
      tick === 0
        ? [{ type: 'pass', passType: 'chestPass', targetId: sgId }]
        : [moveToward(state.game, CUT_SPOT)];
    const prev = state;
    state = stepPracticeRun(GIVE_AND_GO, prev.run, prev.game, actions);
    if (state.run.phaseId === 'cut') out.reachedCut = true;
    for (const role of ROLES) {
      const before = player(prev.game, 'defense', role);
      const after = player(state.game, 'defense', role);
      const limit =
        before.movement.speedMps * state.game.movementTuning.sprintSpeedMultiplier * FIXED_DT;
      const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
      out.maxStep = Math.max(out.maxStep, moved - limit);
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
  });
  return out;
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
