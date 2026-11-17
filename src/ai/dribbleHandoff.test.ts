// Dribble Handoff specifics: loaded shape, the automatic handoff, and the switch coverage.
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
import { SIM_HZ, type GameEvent, type SimAction } from '../sim';
import {
  SCREEN_HOLD_TIMEOUT_S,
  createCorrectReadBot,
  startRunController,
  stepRunController,
  type PlayBot,
  type RunAttempt,
  type RunControllerState,
  type ScreenHold,
} from './index';

const roles = loadCastContent().roles;
const PLAY = loadPlaybook(roles).dribbleHandoff as PlayScenario;
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
  actions: SimAction[];
  readState: RunControllerState | null;
  attempt: RunAttempt | null;
}

function run(
  mode: typeof PRACTICE,
  coverageId: string,
  seed: number,
  readMove?: 'shoot' | 'floater',
): RunLog {
  const inner = createCorrectReadBot(PLAY);
  const log: RunLog = { events: [], actions: [], readState: null, attempt: null };
  const bot: PlayBot = (view) => {
    let actions = inner(view);
    if (readMove !== undefined && view.run.phaseId === 'read') {
      actions = actions.map((a): SimAction => (a.type === 'move' ? a : { type: readMove }));
    }
    log.actions.push(...actions);
    return actions;
  };
  let controller = startRunController(PLAY, mode, { seed, ...SETUPS, coverageId });
  for (let i = 0; i < MAX_STEPS; i++) {
    if (log.readState === null && controller.run.phaseId === 'read') log.readState = controller;
    const step = stepRunController(PLAY, controller, bot(controller));
    controller = step.controller;
    log.events.push(...step.events);
    if (step.attempt !== null) {
      log.attempt = step.attempt;
      return log;
    }
  }
  throw new Error('no attempt');
}

/** The offense role whose player is nearest to the defender keyed by `defenderRole`. */
function guardedRole(state: RunControllerState, defenderRole: string): string {
  const defender = state.game.players.find((p) => p.side === 'defense' && p.role === defenderRole);
  if (defender === undefined) throw new Error(`no defender ${defenderRole}`);
  const dist = (p: { pos: { x: number; z: number } }) =>
    Math.hypot(p.pos.x - defender.pos.x, p.pos.z - defender.pos.z);
  const offense = state.game.players.filter((p) => p.side === 'offense');
  const first = offense[0];
  if (first === undefined) throw new Error('no offense');
  return offense.reduce((best, p) => (dist(p) < dist(best) ? p : best), first).role;
}

function offenseRole(state: RunControllerState, role: string) {
  const p = state.game.players.find((q) => q.side === 'offense' && q.role === role);
  if (p === undefined) throw new Error(`no offense ${role}`);
  return p;
}

describe('Dribble Handoff data', () => {
  it('loads with the planned shape', () => {
    expect(PLAY.difficulty).toBe(3);
    expect(PLAY.practiceCoverage).toBe('overTheTop');
    expect(PLAY.coverages.map((c) => c.id)).toEqual([
      'overTheTop',
      'underTheScreen',
      'switchOnHandoff',
    ]);
  });
});

describe('the handoff is automatic', () => {
  const cases: [string, typeof PRACTICE, string][] = [
    ['practice', PRACTICE, 'overTheTop'],
    ['scrimmage', SCRIMMAGE, 'overTheTop'],
    ['scrimmage', SCRIMMAGE, 'underTheScreen'],
    ['scrimmage', SCRIMMAGE, 'switchOnHandoff'],
  ];
  it.each(cases)('%s / %s: C hands the ball to PG with no user handoff', (_n, mode, coverage) => {
    const log = run(mode, coverage, 1);
    const handoffs = log.events.filter(
      (e) => e.type === 'passCompleted' && e.passType === 'handOff',
    );
    expect(handoffs).toHaveLength(1);
    const start = startRunController(PLAY, mode, { seed: 1, ...SETUPS, coverageId: coverage });
    const c = offenseRole(start, 'C');
    const pg = offenseRole(start, 'PG');
    expect(handoffs[0]).toMatchObject({ passerId: c.id, receiverId: pg.id });
    expect(log.actions.filter((a) => a.type === 'pass' && a.passType === 'handOff')).toEqual([]);
  });
});

describe('the C holds after the handoff', () => {
  it('practice: C holds its handoff spot until the PG is past, within the timeout', () => {
    const bot = createCorrectReadBot(PLAY);
    let controller = startRunController(PLAY, PRACTICE, {
      seed: 1,
      ...SETUPS,
      coverageId: PLAY.practiceCoverage,
    });
    const cId = offenseRole(controller, 'C').id;
    const pgId = offenseRole(controller, 'PG').id;
    const timeoutTicks = Math.round(SCREEN_HOLD_TIMEOUT_S * SIM_HZ);
    let hold: ScreenHold | null = null;
    let releaseTick: number | null = null;
    for (let i = 0; i < MAX_STEPS && releaseTick === null; i++) {
      const step = stepRunController(PLAY, controller, bot(controller));
      controller = step.controller;
      const handedOff = step.events.some(
        (e) =>
          e.type === 'passCompleted' &&
          e.passType === 'handOff' &&
          e.passerId === cId &&
          e.receiverId === pgId,
      );
      if (handedOff) {
        const started = controller.run.screenHolds.find((h) => h.role === 'C');
        expect(started).toMatchObject({
          role: 'C',
          handler: 'PG',
          startTick: controller.game.tick,
        });
        hold = started ?? null;
        continue;
      }
      if (hold === null) continue;
      if (controller.run.screenHolds.some((h) => h.role === 'C')) {
        const c = offenseRole(controller, 'C');
        expect(Math.hypot(c.pos.x - hold.spot.x, c.pos.z - hold.spot.z)).toBeLessThanOrEqual(0.05);
      } else {
        releaseTick = controller.game.tick;
      }
      expect(step.attempt).toBeNull();
    }
    expect(hold).not.toBeNull();
    expect(releaseTick).not.toBeNull();
    const startTick = (hold as unknown as ScreenHold).startTick;
    expect((releaseTick as unknown as number) - startTick).toBeLessThanOrEqual(timeoutTicks);
  });
});

describe('Practice cones stay off the PG path', () => {
  it('every Practice-standard PG spot is at least 1.2 m from the PG track segments', () => {
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
    // The entry step is the ordinary start-of-play guard; the cones that move are the later steps.
    for (const step of standard.script.filter((s) => s.phase !== 'entry')) {
      const spot = step.defenders.PG.spot;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (a === undefined || b === undefined) continue;
        expect(segDist(spot, a, b), `${step.phase} segment ${i}`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });
});

describe('the other graded reads', () => {
  const cases: [string, string, 'shoot' | 'floater', 'great' | 'good'][] = [
    ['switchOnHandoff', 'floater', 'floater', 'great'],
    ['underTheScreen', 'floater', 'floater', 'good'],
    ['overTheTop', 'shoot', 'shoot', 'good'],
  ];
  it.each(cases)('%s + %s is a %s-graded success', (coverage, _m, move, quality) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { attempt } = run(SCRIMMAGE, coverage, seed, move);
      expect(attempt?.outcome, `seed ${seed}`).toMatchObject({ kind: 'success', quality });
    }
  });
});

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

describe('switch on the handoff', () => {
  it.each([1, 2, 3, 4, 5])('the PG defender ends on the C and vice versa (seed %i)', (seed) => {
    const state = settledAtRead('switchOnHandoff', seed, 150);
    expect(guardedRole(state, 'PG')).toBe('C');
    expect(guardedRole(state, 'C')).toBe('PG');
  });

  it('the defenders still guard their own men when the handoff is made', () => {
    const script = PLAY.coverages.find((c) => c.id === 'switchOnHandoff')?.script ?? [];
    expect(script.map((s) => s.phase)).toEqual(['entry', 'handoff', 'attack']);
    const handoff = script.find((s) => s.phase === 'handoff');
    expect(handoff?.defenders.PG.action).toBe('guard');
    expect(handoff?.defenders.C.action).toBe('guard');
  });

  it('control: over the top leaves the C defender off the PG', () => {
    const state = settledAtRead('overTheTop', 1, 150);
    expect(guardedRole(state, 'C')).toBe('C');
  });
});
