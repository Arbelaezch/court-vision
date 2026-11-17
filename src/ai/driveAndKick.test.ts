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
import { isBeyondArc, type GameEvent } from '../sim';
import { GRADE_REASONS, classifyAction, type ResolvingAction } from './grading';
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
  controller: RunControllerState | null;
  /** The state just before the step that releases the ball (the pass or shot). */
  released: RunControllerState | null;
  events: GameEvent[];
}

function run(
  coverageId: string,
  seed: number,
  readMove?: 'shoot' | 'floater',
  walk = false,
): RunLog {
  const inner = createCorrectReadBot(PLAY);
  const log: RunLog = {
    readState: null,
    attempt: null,
    controller: null,
    released: null,
    events: [],
  };
  const bot: PlayBot = (view) => {
    let actions = inner(view);
    // A walking bot never sprints: the sprint action stays but is not held.
    if (walk) actions = actions.map((a) => (a.type === 'sprint' ? { ...a, held: false } : a));
    if (readMove !== undefined && view.run.phaseId === 'read') {
      return actions.map((a) => (a.type === 'move' ? a : { type: readMove }));
    }
    return actions;
  };
  let controller = startRunController(PLAY, SCRIMMAGE, { seed, ...SETUPS, coverageId });
  for (let i = 0; i < MAX_STEPS; i++) {
    if (log.readState === null && controller.run.phaseId === 'read') log.readState = controller;
    const before = controller;
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    log.events.push(...step.events);
    if (log.released === null && controller.game.ball.kind === 'inFlight') {
      log.released = before;
    }
    if (step.attempt !== null) {
      log.attempt = step.attempt;
      log.controller = controller;
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
  const decision = PLAY.decisions.find((d) => d.id === 'driveRead');
  if (decision === undefined) throw new Error('no decision');
  const expected: Record<string, string[]> = {
    helpSteps: ['kickOut', 'kickOutBounce'],
    noHelp: ['finishAtRim'],
    bigAtRim: ['floatOver'],
    aggressiveCloseout: ['dishToCorner', 'dishToCornerBounce'],
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

describe('beatCloseout', () => {
  const decision = PLAY.decisions.find((d) => d.id === 'beatCloseout');
  if (decision === undefined) throw new Error('no beatCloseout');
  const coverages = PLAY.coverages.map((c) => c.id);

  it('sprintBy is great in every coverage', () => {
    const option = decision.options.find((o) => o.id === 'sprintBy');
    expect(option?.move).toBe('sprint');
    for (const c of coverages) expect(option?.grades[c], c).toBe('great');
  });

  it('driveOn is good in aggressiveCloseout and great elsewhere', () => {
    const option = decision.options.find((o) => o.id === 'driveOn');
    for (const c of coverages) {
      expect(option?.grades[c], c).toBe(c === 'aggressiveCloseout' ? 'good' : 'great');
    }
  });

  it('aggressiveCloseout is graded differently from noHelp', () => {
    const differs = PLAY.decisions.some((d) =>
      d.options.some((o) => o.grades.aggressiveCloseout !== o.grades.noHelp),
    );
    expect(differs).toBe(true);
    const sprintBy = decision.options.find((o) => o.id === 'sprintBy');
    expect(sprintBy?.grades.aggressiveCloseout).toBe('great');
  });
});

describe('aggressiveCloseout reads', () => {
  const seeds = [1, 2, 3, 4, 5];
  const classify = (action: ResolvingAction, targetRole: 'SG' | 'C' | null) =>
    classifyAction(PLAY, {
      role: 'PG',
      phaseId: 'read',
      coverageId: 'aggressiveCloseout',
      action,
      targetRole,
    });

  it.each(seeds)('a walking bot is graded driveOn good and the run continues (seed %i)', (seed) => {
    const { attempt, controller, events } = run('aggressiveCloseout', seed, undefined, true);
    expect(controller?.referee.graded[0]).toMatchObject({
      decisionId: 'beatCloseout',
      optionId: 'driveOn',
      grade: 'good',
    });
    expect(events.some((e) => e.type === 'mistake' || e.type === 'runUnsuccessful')).toBe(false);
    expect(attempt?.outcome).toMatchObject({ kind: 'success', quality: 'good' });
  });

  it.each(seeds)('the correct bot sprints by, then dishes to the corner (seed %i)', (seed) => {
    const { attempt, controller, released } = run('aggressiveCloseout', seed);
    expect(controller?.referee.graded.map((g) => g.optionId)).toEqual(['sprintBy', 'dishToCorner']);
    expect(attempt?.outcome).toMatchObject({ kind: 'success', quality: 'great' });
    if (released === null) throw new Error('no pass released');
    // The pass leaves while the big is still stepping over, so this is a looser bound than 2.0 m.
    expect(
      dist(player(released, 'defense', 'C').pos, player(released, 'offense', 'PG').pos),
    ).toBeLessThanOrEqual(3.0);
    const corner = player(released, 'offense', 'C').pos;
    for (const d of released.game.players.filter((p) => p.side === 'defense')) {
      expect(dist(d.pos, corner), `${d.role} to the corner`).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('grades the dish great and scoring through good', () => {
    const chest: ResolvingAction = { type: 'pass', passType: 'chestPass', targetId: 0 };
    const bounce: ResolvingAction = { type: 'pass', passType: 'bouncePass', targetId: 0 };
    expect(classify(chest, 'C')).toMatchObject({ grade: 'great', exactMove: true });
    expect(classify(bounce, 'C')).toMatchObject({ grade: 'great' });
    expect(classify({ type: 'shoot' }, null)).toMatchObject({
      optionId: 'finishAtRim',
      grade: 'good',
    });
    expect(classify({ type: 'floater' }, null)).toMatchObject({
      optionId: 'floatOver',
      grade: 'good',
    });
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

  it.each(seeds)('aggressiveCloseout: the C defender switches onto the PG (seed %i)', (seed) => {
    const s = look('aggressiveCloseout', seed);
    const gap = (st: typeof s) =>
      dist(player(st, 'defense', 'C').pos, player(st, 'offense', 'PG').pos);
    // Settled, the switched C defender sits on the PG (about 1.4 m); a sagging big stays above 1.5 m.
    expect(gap(s)).toBeLessThan(1.5);
    // A switch guards the PG from a cushion; it does not just walk to the scripted sag spot
    // (0.6, -3.9), so removing the switch (a plain sag) would put it on that spot.
    expect(dist(player(s, 'defense', 'C').pos, { x: 0.6, z: -3.9 })).toBeGreaterThan(1.0);
    // The offense C stays open: at least 3.0 m from every defender.
    for (const d of s.game.players.filter((p) => p.side === 'defense')) {
      expect(dist(d.pos, player(s, 'offense', 'C').pos)).toBeGreaterThanOrEqual(3.0);
    }
    // Contrast: without the switch the C defender stays home, further from the PG.
    for (const cov of ['noHelp', 'bigAtRim']) {
      expect(gap(look(cov, seed)), cov).toBeGreaterThanOrEqual(1.5);
    }
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
    ['aggressiveCloseout', 'shoot', 'good'],
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
