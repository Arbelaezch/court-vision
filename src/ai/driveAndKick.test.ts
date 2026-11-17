// Drive-and-Kick specifics: loaded shape, setup, graded reads and a distinct defender look per coverage.
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
import { isBeyondArc } from '../sim';
import { GRADE_REASONS } from './grading';
import {
  createCorrectReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunAttempt,
  type RunControllerState,
} from './index';

const roles = loadCastContent().roles;
const PLAY = loadPlaybook(roles).driveAndKick as PlayScenario;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SCRIMMAGE = loadMode('scrimmage');
const MAX_STEPS = 2400;
const RIM = { x: 0, z: -5.425 };

interface RunLog {
  readState: RunControllerState | null;
  attempt: RunAttempt | null;
}

function run(coverageId: string, seed: number, readMove?: 'shoot' | 'floater'): RunLog {
  const inner = createCorrectReadBot(PLAY);
  const log: RunLog = { readState: null, attempt: null };
  const bot: PlayBot = (view) => {
    const actions = inner(view);
    if (readMove !== undefined && view.run.phaseId === 'read') {
      return actions.map((a) => (a.type === 'move' ? a : { type: readMove }));
    }
    return actions;
  };
  let controller = startRunController(PLAY, SCRIMMAGE, { seed, ...SETUPS, coverageId });
  for (let i = 0; i < MAX_STEPS; i++) {
    if (log.readState === null && controller.run.phaseId === 'read') log.readState = controller;
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    if (step.attempt !== null) {
      log.attempt = step.attempt;
      return log;
    }
  }
  throw new Error('no attempt');
}

function player(state: RunControllerState, side: 'offense' | 'defense', role: string) {
  const p = state.game.players.find((q) => q.side === side && q.role === role);
  if (p === undefined) throw new Error(`no ${side} ${role}`);
  return p;
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('Drive-and-Kick data', () => {
  it('loads with the planned shape', () => {
    expect(PLAY.difficulty).toBe(2);
    expect(PLAY.practiceCoverage).toBe('helpSteps');
    expect(PLAY.coverages.map((c) => c.id)).toEqual([
      'helpSteps',
      'noHelp',
      'bigAtRim',
      'aggressiveCloseout',
    ]);
  });

  it('starts 5-out with both corners filled', () => {
    for (const [role, pos] of Object.entries(PLAY.setup.positions)) {
      if (role === 'PG') continue;
      expect(isBeyondArc(pos), role).toBe(true);
      if (role === 'SG' || role === 'C') {
        expect(Math.abs(pos.x), role).toBeGreaterThanOrEqual(6.6);
        expect(pos.z, role).toBeLessThanOrEqual(-5);
      }
    }
  });
});

describe('best reads', () => {
  const decision = PLAY.decisions[0];
  if (decision === undefined) throw new Error('no decision');
  const expected: Record<string, string[]> = {
    helpSteps: ['kickOut', 'kickOutBounce'],
    noHelp: ['finishAtRim'],
    bigAtRim: ['floatOver'],
    aggressiveCloseout: ['finishAtRim'],
  };

  it.each(Object.entries(expected))('%s has the planned great options', (coverage, ids) => {
    const great = decision.options.filter((o) => o.grades[coverage] === 'great').map((o) => o.id);
    expect(great).toEqual(ids);
  });

  it.each(Object.entries(expected))('great options of %s are not great elsewhere', (cov, ids) => {
    for (const id of ids) {
      const option = decision.options.find((o) => o.id === id);
      const others = PLAY.coverages.filter((c) => c.id !== cov);
      const notGreat = others.some((c) => option?.grades[c.id] !== 'great');
      expect(notGreat, id).toBe(true);
    }
  });
});

describe('Practice cones stay off the PG path', () => {
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

  it('every defender spot in the Practice read step is at least 1.2 m from the PG track', () => {
    const step = standard.script.find((s) => s.phase === 'read');
    if (step === undefined) throw new Error('no read step');
    for (const [role, d] of Object.entries(step.defenders)) {
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (a === undefined || b === undefined) continue;
        expect(segDist(d.spot, a, b), `${role} segment ${i}`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });

  it('every non-PG defender spot in the drive step is at least 1.2 m from the PG track', () => {
    const step = standard.script.find((s) => s.phase === 'drive');
    if (step === undefined) throw new Error('no drive step');
    for (const [role, d] of Object.entries(step.defenders)) {
      if (role === 'PG') continue;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (a === undefined || b === undefined) continue;
        expect(segDist(d.spot, a, b), `${role} segment ${i}`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });
});

describe('each coverage looks different', () => {
  const seeds = [1, 2, 3, 4, 5];
  const look = (cov: string, seed: number) => {
    let state = run(cov, seed).readState;
    if (state === null) throw new Error('never reached read');
    // The PG stands still so the defenders can settle into the look.
    for (let i = 0; i < 90; i++) {
      state = stepRunController(PLAY, state, [{ type: 'move', x: 0, z: 0 }]).controller;
    }
    return state;
  };

  it.each(seeds)('helpSteps: the SG defender is on the ball (seed %i)', (seed) => {
    const s = look('helpSteps', seed);
    const sGap = dist(player(s, 'defense', 'SG').pos, player(s, 'offense', 'PG').pos);
    expect(sGap).toBeLessThan(2.0);
    const n = look('noHelp', seed);
    const nGap = dist(player(n, 'defense', 'SG').pos, player(n, 'offense', 'PG').pos);
    expect(nGap).toBeGreaterThan(3.0);
  });

  it.each(seeds)('bigAtRim: the C defender is at the rim (seed %i)', (seed) => {
    const s = look('bigAtRim', seed);
    expect(dist(player(s, 'defense', 'C').pos, RIM)).toBeLessThan(1.5);
    const n = look('noHelp', seed);
    expect(dist(player(n, 'defense', 'C').pos, RIM)).toBeGreaterThanOrEqual(1.5);
  });

  // The closeout only shows during the drive: the PG defender's closest approach to the PG.
  const driveGap = (cov: string, seed: number): number => {
    const inner = createCorrectReadBot(PLAY);
    let controller = startRunController(PLAY, SCRIMMAGE, { seed, ...SETUPS, coverageId: cov });
    let min = Infinity;
    for (let i = 0; i < MAX_STEPS && controller.run.phaseId === 'drive'; i++) {
      controller = stepRunController(PLAY, controller, inner(controller)).controller;
      min = Math.min(
        min,
        dist(player(controller, 'defense', 'PG').pos, player(controller, 'offense', 'PG').pos),
      );
    }
    return min;
  };

  it.each(seeds)('aggressiveCloseout: the PG defender closes out hard (seed %i)', (seed) => {
    const hard = driveGap('aggressiveCloseout', seed);
    const none = driveGap('noHelp', seed);
    expect(hard).toBeLessThan(1.0);
    expect(none).toBeGreaterThanOrEqual(1.0);
  });
});

describe('the other graded reads', () => {
  const cases: [string, 'shoot' | 'floater', 'good' | 'bad'][] = [
    ['noHelp', 'floater', 'good'],
    ['aggressiveCloseout', 'floater', 'good'],
  ];
  it.each(cases)('%s + %s is a %s-graded success', (coverage, move, quality) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { attempt } = run(coverage, seed, move);
      expect(attempt?.outcome, `seed ${seed}`).toMatchObject({ kind: 'success', quality });
    }
  });

  it('bigAtRim + shoot is an unsuccessful bad read', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { attempt } = run('bigAtRim', seed, 'shoot');
      expect(attempt?.outcome, `seed ${seed}`).toMatchObject({
        kind: 'unsuccessful',
        reason: GRADE_REASONS.bad,
      });
    }
  });
});
