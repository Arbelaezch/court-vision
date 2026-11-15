// High Pick-and-Roll specifics: loaded shape, the automatic screen, Practice cones, and the
// hedge, switch and corner-help coverages.
import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import type { GameEvent } from '../sim';
import {
  createCorrectReadBot,
  startRunController,
  stepRunController,
  type RunControllerState,
} from './index';

const roles = loadCastContent().roles;
const PLAY = loadPlaybook(roles).highPickAndRoll as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const PRACTICE = loadMode('practice');
const SCRIMMAGE = loadMode('scrimmage');
const MAX_STEPS = 2400;

interface RunLog {
  events: GameEvent[];
  readState: RunControllerState | null;
}

function run(mode: typeof PRACTICE, coverageId: string, seed: number): RunLog {
  const bot = createCorrectReadBot(PLAY);
  const log: RunLog = { events: [], readState: null };
  let controller = startRunController(PLAY, mode, { seed, ...SETUPS, coverageId });
  for (let i = 0; i < MAX_STEPS; i++) {
    if (log.readState === null && controller.run.phaseId === 'read') log.readState = controller;
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    log.events.push(...step.events);
    if (step.attempt !== null) return log;
  }
  throw new Error('no attempt');
}

/** The offense role whose player is nearest to the defender keyed by `defenderRole`. */
function guardedRole(state: RunControllerState, defenderRole: string): string {
  const defender = player(state, 'defense', defenderRole);
  const dist = (p: { pos: { x: number; z: number } }) =>
    Math.hypot(p.pos.x - defender.pos.x, p.pos.z - defender.pos.z);
  const offense = state.game.players.filter((p) => p.side === 'offense');
  const first = offense[0];
  if (first === undefined) throw new Error('no offense');
  return offense.reduce((best, p) => (dist(p) < dist(best) ? p : best), first).role;
}

function player(state: RunControllerState, side: 'offense' | 'defense', role: string) {
  const p = state.game.players.find((q) => q.side === side && q.role === role);
  if (p === undefined) throw new Error(`no ${side} ${role}`);
  return p;
}

/** The read-phase state after the PG stands still for `ticks`, so the defenders can settle. */
function settledAtRead(coverageId: string, seed: number, ticks: number): RunControllerState {
  const log = run(SCRIMMAGE, coverageId, seed);
  let state = log.readState;
  if (state === null) throw new Error('never reached read');
  for (let i = 0; i < ticks; i++) {
    state = stepRunController(PLAY, state, [{ type: 'move', x: 0, z: 0 }]).controller;
  }
  return state;
}

describe('High Pick-and-Roll data', () => {
  it('loads with the planned shape', () => {
    expect(PLAY.difficulty).toBe(4);
    expect(PLAY.practiceCoverage).toBe('dropBig');
    expect(PLAY.coverages.map((c) => c.id)).toEqual([
      'dropBig',
      'hedgeRecover',
      'switchOnScreen',
      'cornerHelp',
    ]);
    const decision = PLAY.decisions.find((d) => d.id === 'pickRead');
    expect(decision?.options.map((o) => o.id)).toEqual([
      'pullUp',
      'bounceToRoller',
      'lobToRoller',
      'downhill',
      'kickToCorner',
    ]);
  });
});

describe('the ball screen is automatic', () => {
  const cases: [string, typeof PRACTICE, string][] = [
    ['practice', PRACTICE, 'dropBig'],
    ['scrimmage', SCRIMMAGE, 'dropBig'],
    ['scrimmage', SCRIMMAGE, 'hedgeRecover'],
    ['scrimmage', SCRIMMAGE, 'switchOnScreen'],
    ['scrimmage', SCRIMMAGE, 'cornerHelp'],
  ];
  it.each(cases)('%s / %s: C screens for PG with no user input', (_n, mode, coverage) => {
    const log = run(mode, coverage, 1);
    const screens = log.events.filter((e) => e.type === 'screenSet');
    expect(screens).toHaveLength(1);
    const start = startRunController(PLAY, mode, { seed: 1, ...SETUPS, coverageId: coverage });
    expect(screens[0]).toMatchObject({
      screenerId: player(start, 'offense', 'C').id,
      targetId: player(start, 'offense', 'PG').id,
    });
  });
});

describe('Practice cones stay off the PG path', () => {
  it('every Practice-standard PG and C defender spot is at least 1.2 m from the PG track segments', () => {
    type Pt = { x: number; z: number };
    const path: Pt[] = [PLAY.setup.positions.PG, ...(PLAY.tracks.PG ?? []).map((t) => t.spot)];
    const segDist = (p: Pt, a: Pt, b: Pt) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
      return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    };
    const standard = PLAY.coverages.find((c) => c.id === PLAY.practiceCoverage);
    if (standard === undefined) throw new Error('no practice coverage');
    for (const step of standard.script.filter((s) => s.phase !== 'screen')) {
      for (const role of ['PG', 'C'] as const) {
        const spot = step.defenders[role].spot;
        for (let i = 0; i + 1 < path.length; i++) {
          const a = path[i];
          const b = path[i + 1];
          if (a === undefined || b === undefined) continue;
          expect(segDist(spot, a, b), `${step.phase} ${role} segment ${i}`).toBeGreaterThanOrEqual(
            1.2,
          );
        }
      }
    }
  });
});

describe('hedge: the recovering big takes away the chest pass', () => {
  it.each([1, 2, 3, 4, 5])(
    'chest into the recovering big is intercepted, bounce completes (seed %i)',
    (seed) => {
      const S = settledAtRead('hedgeRecover', seed, 150);
      const offPg = player(S, 'offense', 'PG');
      const offC = player(S, 'offense', 'C');
      const defC = player(S, 'defense', 'C');

      // The big sits in the lane between the passer and the roller.
      const dx = offC.pos.x - offPg.pos.x;
      const dz = offC.pos.z - offPg.pos.z;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(
        0,
        Math.min(1, ((defC.pos.x - offPg.pos.x) * dx + (defC.pos.z - offPg.pos.z) * dz) / len2),
      );
      const laneDist = Math.hypot(
        defC.pos.x - (offPg.pos.x + t * dx),
        defC.pos.z - (offPg.pos.z + t * dz),
      );
      expect(laneDist).toBeLessThanOrEqual(0.5);

      const settlePass = (passType: 'chestPass' | 'bouncePass') => {
        let step = stepRunController(PLAY, S, [{ type: 'pass', passType, targetId: offC.id }]);
        const events = [...step.events];
        for (let i = 0; i < 180 && step.controller.game.ball.kind === 'inFlight'; i++) {
          step = stepRunController(PLAY, step.controller, [{ type: 'move', x: 0, z: 0 }]);
          events.push(...step.events);
        }
        return { ball: step.controller.game.ball, events };
      };

      const chest = settlePass('chestPass');
      expect(chest.events).toContainEqual(
        expect.objectContaining({
          type: 'mistake',
          kind: 'turnover',
          reason: 'Passed into a crowded lane',
        }),
      );
      expect(chest.ball).toEqual({ kind: 'held', holderId: defC.id });

      const bounce = settlePass('bouncePass');
      expect(bounce.events).toContainEqual(
        expect.objectContaining({ type: 'passCompleted', receiverId: offC.id }),
      );
      expect(bounce.events.filter((e) => e.type === 'mistake')).toEqual([]);
    },
  );
});

describe('switch on the screen', () => {
  it('the defenders still guard their own men until the screen, then swap', () => {
    const script = PLAY.coverages.find((c) => c.id === 'switchOnScreen')?.script ?? [];
    const screen = script.find((s) => s.phase === 'screen');
    const comeOff = script.find((s) => s.phase === 'comeOff');
    expect(screen?.defenders.PG.action).toBe('guard');
    expect(screen?.defenders.C.action).toBe('guard');
    expect(comeOff?.defenders.PG).toMatchObject({ action: 'switch', guards: 'C' });
    expect(comeOff?.defenders.C).toMatchObject({ action: 'switch', guards: 'PG' });
  });

  it.each([1, 2, 3, 4, 5])('the PG defender ends on the C (seed %i)', (seed) => {
    const state = settledAtRead('switchOnScreen', seed, 150);
    expect(guardedRole(state, 'PG')).toBe('C');
  });
});

describe('corner help', () => {
  it.each([1, 2, 3, 4, 5])('the PF defender tags the roller (seed %i)', (seed) => {
    const state = settledAtRead('cornerHelp', seed, 150);
    const helper = player(state, 'defense', 'PF');
    const dist = (role: string) => {
      const o = player(state, 'offense', role);
      return Math.hypot(helper.pos.x - o.pos.x, helper.pos.z - o.pos.z);
    };
    expect(dist('C')).toBeLessThan(dist('PF'));
  });
});
