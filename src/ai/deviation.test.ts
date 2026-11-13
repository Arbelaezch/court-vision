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
import { RIM_CENTER, type CourtPoint, type GameState, type RoleId } from '../sim';
import { PG_LANE_HALF_WIDTH_M, distanceToSegment } from './spacing';
import { startPracticeRun, stepPracticeRun, type PlayRunState } from './index';
import { SCREEN_TEST_PLAY_DATA, SCREEN_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const ROLES: readonly RoleId[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const MIN_GAP_M = 0.8;

function offense(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`no offense ${role}`);
  return player;
}

function holderId(game: GameState): number | null {
  return game.ball.kind === 'held' ? game.ball.holderId : null;
}

function minPairGap(game: GameState): number {
  let min = Infinity;
  for (let i = 0; i < ROLES.length; i += 1) {
    for (let j = i + 1; j < ROLES.length; j += 1) {
      const a = offense(game, ROLES[i] as RoleId).pos;
      const b = offense(game, ROLES[j] as RoleId).pos;
      min = Math.min(min, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  return min;
}

function laneScreenTest(sgSetup?: CourtPoint): PlayScenario {
  const data = structuredClone(SCREEN_TEST_PLAY_DATA) as any;
  const step = data.tracks.SG.find((s: any) => s.phase === 'walkUp');
  step.spot = { x: 0, z: -2 };
  if (sgSetup !== undefined) data.setup.positions.SG = sgSetup;
  return loadScenario({ file: SCREEN_TEST_PLAY_FILE, data }, roles);
}

/** SG starts in the far corner, so it is still walking to its lane spot when SF catches. */
const SG_FAR_SETUP = { x: 7, z: 6.5 };

describe('AC4: an unexpected pass', () => {
  it.each(SEEDS)('giveAndGo seed %i: freezes the phase and keeps the ball with SF', (seed) => {
    const play = GIVE_AND_GO;
    const start = startPracticeRun(play, { seed, ...SETUPS });
    let { game, run } = start;
    const sfId = offense(game, 'SF').id;
    let minGap = Infinity;
    for (let tick = 0; tick < 600; tick += 1) {
      const actions =
        tick === 0 ? [{ type: 'pass', passType: 'chestPass', targetId: sfId } as const] : [];
      ({ game, run } = stepPracticeRun(play, run, game, actions));
      minGap = Math.min(minGap, minPairGap(game));
      if (tick > 120) expect(holderId(game)).toBe(sfId);
    }
    expect(run.deviated).toBe(true);
    expect(run.phaseId).toBe('entry');
    expect(holderId(game)).toBe(sfId);
    expect(minGap).toBeGreaterThanOrEqual(MIN_GAP_M);
  });

  it('screenTest: a teammate in the lane keeps moving out of it after the deviation', () => {
    const play = laneScreenTest(SG_FAR_SETUP);
    let { game, run } = startPracticeRun(play, { seed: 3, ...SETUPS });
    const sfId = offense(game, 'SF').id;
    const sgStart = { ...offense(game, 'SG').pos };
    let sgAfterCatch: CourtPoint | null = null;
    let travelled: number | null = null;
    let minGap = Infinity;
    let deviatedAt: number | null = null;
    for (let tick = 0; tick < 600; tick += 1) {
      const actions =
        tick === 0 ? [{ type: 'pass', passType: 'bouncePass', targetId: sfId } as const] : [];
      ({ game, run } = stepPracticeRun(play, run, game, actions));
      minGap = Math.min(minGap, minPairGap(game));
      if (deviatedAt === null && run.deviated) {
        deviatedAt = tick;
        sgAfterCatch = { ...offense(game, 'SG').pos };
      }
      if (deviatedAt !== null && tick === deviatedAt + 300) {
        const sg = offense(game, 'SG').pos;
        travelled = Math.hypot(
          sg.x - (sgAfterCatch as CourtPoint).x,
          sg.z - (sgAfterCatch as CourtPoint).z,
        );
      }
    }
    expect(deviatedAt).not.toBeNull();
    expect(run.deviated).toBe(true);
    // SG was still walking when SF caught the ball and kept walking after the deviation.
    expect(travelled).not.toBeNull();
    expect(travelled as unknown as number).toBeGreaterThan(1);
    const sg = offense(game, 'SG').pos;
    expect(distanceToSegment(sg, offense(game, 'PG').pos, RIM_CENTER)).toBeGreaterThanOrEqual(
      PG_LANE_HALF_WIDTH_M,
    );
    expect(Math.hypot(sg.x - sgStart.x, sg.z - sgStart.z)).toBeGreaterThan(1);
    expect(minGap).toBeGreaterThanOrEqual(MIN_GAP_M);
    expect(run.phaseId).toBe('walkUp');
  });
});

describe('lane avoidance without a deviation', () => {
  it('moves a teammate whose spot is in the PG lane out of it, toward the spot', () => {
    const play = laneScreenTest();
    let { game, run }: { game: GameState; run: PlayRunState } = startPracticeRun(play, {
      seed: 1,
      ...SETUPS,
    });
    const sgStart = { ...offense(game, 'SG').pos };
    for (let tick = 0; tick < 360; tick += 1) {
      ({ game, run } = stepPracticeRun(play, run, game, []));
    }
    const sg = offense(game, 'SG').pos;
    const lane = { x: 0, z: -2 };
    expect(run.deviated).toBe(false);
    expect(distanceToSegment(sg, offense(game, 'PG').pos, RIM_CENTER)).toBeGreaterThanOrEqual(
      PG_LANE_HALF_WIDTH_M,
    );
    expect(Math.hypot(sg.x - lane.x, sg.z - lane.z)).toBeLessThan(
      Math.hypot(sgStart.x - lane.x, sgStart.z - lane.z),
    );
  });
});
