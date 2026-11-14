import { describe, expect, it } from 'vitest';
import {
  DEFENDER_ACTIONS,
  loadCastContent,
  loadPlaybook,
  loadSimMovement,
  type DefenderAction,
  type DefenderStep,
  type PlayScenario,
} from '../content';
import {
  FIXED_DT,
  RIM_CENTER,
  ROLE_ORDER,
  createGame,
  stepGame,
  type CourtPoint,
  type GameState,
  type PlayerState,
  type RoleId,
  type SimAction,
} from '../sim';
import {
  CLOSEOUT_CUSHION_M,
  GUARD_CUSHION_M,
  defenderCommands,
  guardPoint,
  isInKey,
} from './defense';

const TOL = 1e-9;
const MOVEMENT = loadSimMovement();
const GIVE_AND_GO = loadPlaybook(loadCastContent().roles).giveAndGo as PlayScenario;

type Steps = Partial<Record<RoleId, DefenderStep>>;

function dist(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function player(game: GameState, side: 'offense' | 'defense', role: RoleId): PlayerState {
  const p = game.players.find((q) => q.side === side && q.role === role);
  if (p === undefined) throw new Error(`no ${side} ${role}`);
  return p;
}

function newGame(seed = 1): GameState {
  const game = structuredClone(createGame({ seed, movement: MOVEMENT, defenseMode: 'live' }));
  game.controlledPlayerId = player(game, 'offense', 'PG').id;
  game.ball = { kind: 'held', holderId: game.controlledPlayerId };
  return game;
}

function place(p: PlayerState, pos: CourtPoint): void {
  p.pos = { x: pos.x, z: pos.z };
  p.vel = { x: 0, z: 0 };
  p.moveIntent = { x: 0, z: 0 };
}

function cutSteps(action: DefenderAction): Steps {
  const coverage = GIVE_AND_GO.coverages.find((c) => c.id === 'helpOnCut');
  const step = coverage?.script.find((s) => s.phase === 'cut');
  if (step === undefined) throw new Error('no helpOnCut cut step');
  const steps: Steps = {};
  for (const role of ROLE_ORDER) steps[role] = { spot: step.defenders[role].spot, action };
  return steps;
}

/** A move toward `spot` for player `me`, ramping down inside 1 m, zero inside 0.1 m. */
function moveToward(me: PlayerState, spot: CourtPoint): SimAction {
  const dx = spot.x - me.pos.x;
  const dz = spot.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return { type: 'move', x: 0, z: 0 };
  const scale = Math.max(d, 1);
  return { type: 'move', x: dx / scale, z: dz / scale };
}

const STAND: SimAction[] = [{ type: 'move', x: 0, z: 0 }];

function tick(game: GameState, steps: Steps, actions: SimAction[]): GameState {
  return stepGame(game, actions, defenderCommands(game, steps));
}

describe('guardPoint and isInKey', () => {
  it('puts the point on the man-to-rim segment, capped at the rim distance', () => {
    const game = newGame();
    const pg = player(game, 'offense', 'PG');
    place(pg, { x: 0, z: 3 });
    const gp = guardPoint(pg, 1.5);
    expect(dist(gp, pg.pos)).toBeCloseTo(1.5, 9);
    expect(gp.z).toBeLessThan(3);
    place(pg, { x: RIM_CENTER.x + 0.5, z: RIM_CENTER.z });
    expect(dist(guardPoint(pg, 1.5), RIM_CENTER)).toBeLessThan(1e-9);
  });

  it('recognizes the key', () => {
    expect(isInKey({ x: 0, z: -3 })).toBe(true);
    expect(isInKey({ x: 3, z: -3 })).toBe(false);
    expect(isInKey({ x: 0, z: 5 })).toBe(false);
  });
});

describe('guard shifts off passing lanes', () => {
  function laneDistance(a: CourtPoint, b: CourtPoint, p: CourtPoint): number {
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * lx + (p.z - a.z) * lz) / (lx * lx + lz * lz)));
    return dist(p, { x: a.x + lx * t, z: a.z + lz * t });
  }

  it('stays clear of the ball holder lanes while staying on the rim side of its man', () => {
    const game = newGame();
    const sg = player(game, 'offense', 'SG');
    place(sg, { x: 5.5, z: -1 });
    place(player(game, 'offense', 'PG'), { x: 0.8, z: -4 });
    game.ball = { kind: 'held', holderId: sg.id };
    const self = player(game, 'defense', 'SG');
    place(self, { x: 5, z: -2 });
    let g = game;
    for (let t = 0; t < 240; t += 1) {
      g = tick(g, { SG: { action: 'guard', spot: { x: 5, z: -2 } } }, STAND);
    }
    const man = player(g, 'offense', 'SG');
    const def = player(g, 'defense', 'SG');
    const radius = g.passing?.tuning.laneRadiusM ?? 0.9;
    for (const mate of g.players) {
      if (mate.side !== 'offense' || mate.id === man.id) continue;
      expect(laneDistance(man.pos, mate.pos, def.pos)).toBeGreaterThanOrEqual(radius);
    }
    expect(dist(def.pos, RIM_CENTER)).toBeLessThan(dist(man.pos, RIM_CENTER));
  });

  it('moves its target smoothly while a teammate crosses the rim line of its man', () => {
    const game = newGame();
    const sg = player(game, 'offense', 'SG');
    place(sg, { x: 5.5, z: -1 });
    place(player(game, 'offense', 'PG'), { x: 7, z: 5 });
    place(player(game, 'offense', 'PF'), { x: 7.5, z: 4 });
    place(player(game, 'offense', 'C'), { x: 8, z: 3 });
    const sf = player(game, 'offense', 'SF');
    const rx = RIM_CENTER.x - sg.pos.x;
    const rz = RIM_CENTER.z - sg.pos.z;
    const rlen = Math.hypot(rx, rz);
    const spot = guardPoint(sg, GUARD_CUSHION_M);
    place(player(game, 'defense', 'SG'), spot);
    let prev: { x: number; z: number } | null = null;
    let maxJump = 0;
    for (let k = -30; k <= 30; k += 1) {
      const off = k * 0.05;
      place(sf, {
        x: sg.pos.x + rx * 0.6 - (rz / rlen) * off,
        z: sg.pos.z + rz * 0.6 + (rx / rlen) * off,
      });
      const cmd = defenderCommands(game, { SG: { action: 'guard', spot } })[0];
      if (cmd === undefined || cmd.type !== 'steer') throw new Error('expected steer');
      if (prev !== null) maxJump = Math.max(maxJump, Math.hypot(cmd.x - prev.x, cmd.z - prev.z));
      prev = { x: cmd.x, z: cmd.z };
    }
    // The steer command is the target offset over the 1 m arrive radius. Without the fade the
    // target jumped about 2.5 m when the teammate crossed the line; now it ramps over a few steps.
    expect(maxJump).toBeLessThan(0.8);
  });

  it('keeps the plain cushion point when no teammate lane passes near it', () => {
    const game = newGame();
    const sg = player(game, 'offense', 'SG');
    place(sg, { x: 5.5, z: -1 });
    place(player(game, 'offense', 'PG'), { x: 5.5, z: 4 });
    place(player(game, 'offense', 'SF'), { x: 5.5, z: 3 });
    place(player(game, 'offense', 'PF'), { x: 7, z: 5 });
    place(player(game, 'offense', 'C'), { x: 3, z: 5 });
    const spot = guardPoint(sg, GUARD_CUSHION_M);
    place(player(game, 'defense', 'SG'), spot);
    const cmd = defenderCommands(game, { SG: { action: 'guard', spot } })[0];
    expect(cmd).toMatchObject({ type: 'steer', x: 0, z: 0 });
  });
});

describe('defenderCommands', () => {
  it('emits only steer commands for roles present, skipping the controlled player', () => {
    const game = newGame();
    const steps = cutSteps('guard');
    const cmds = defenderCommands(game, steps);
    const pgDefender = player(game, 'defense', 'PG');
    expect(cmds.every((c) => c.type === 'steer')).toBe(true);
    expect(cmds).toHaveLength(5);
    game.controlledPlayerId = pgDefender.id;
    expect(defenderCommands(game, steps)).toHaveLength(4);
    expect(defenderCommands(game, { SF: steps.SF })).toHaveLength(1);
  });

  it('throws a Court Vision error when a role has no defender', () => {
    const game = newGame();
    game.players = game.players.filter((p) => !(p.side === 'defense' && p.role === 'SF'));
    expect(() => defenderCommands(game, cutSteps('guard'))).toThrow(/Court Vision:/);
  });
});

describe('physics limits (AC1)', () => {
  const ZIGZAG: readonly [number, number][] = [
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0.5],
    [0, -1],
    [0, 1],
  ];

  it.each(DEFENDER_ACTIONS)('%s never exceeds top speed, acceleration or teleports', (action) => {
    let game = newGame();
    const pgId = game.controlledPlayerId;
    const steps = cutSteps(action);
    for (let t = 0; t < 600; t += 1) {
      const [zx, zz] = ZIGZAG[Math.floor(t / 40) % ZIGZAG.length] as [number, number];
      // Keep the PG inside a safe box on the court: turn the zigzag back at the box edge.
      const pgNow = game.players.find((p) => p.id === pgId) as PlayerState;
      const rx = Math.abs(pgNow.pos.x) > 5 && Math.sign(zx) === Math.sign(pgNow.pos.x) ? -zx : zx;
      const rz = (pgNow.pos.z < -2 && zz < 0) || (pgNow.pos.z > 3.5 && zz > 0) ? -zz : zz;
      const len = Math.hypot(rx, rz);
      const actions: SimAction[] = [
        { type: 'sprint', held: t < 240 },
        { type: 'move', x: rx / len, z: rz / len },
      ];
      const cmds = defenderCommands(game, steps);
      expect(cmds.every((c) => c.type === 'steer')).toBe(true);
      const prev = game;
      game = stepGame(prev, actions, cmds);
      const { sprintSpeedMultiplier, brakingMultiplier } = game.movementTuning;
      for (const p of game.players) {
        if (p.side !== 'defense' || p.id === pgId) continue;
        const before = prev.players.find((q) => q.id === p.id) as PlayerState;
        const { speedMps, accelerationMps2 } = p.movement;
        const speed = Math.hypot(p.vel.x, p.vel.z);
        const prevSpeed = Math.hypot(before.vel.x, before.vel.z);
        expect(speed).toBeLessThanOrEqual(speedMps * sprintSpeedMultiplier + TOL);
        if (!p.sprinting && prevSpeed <= speedMps + TOL) {
          expect(speed).toBeLessThanOrEqual(speedMps + TOL);
        }
        const dv = Math.hypot(p.vel.x - before.vel.x, p.vel.z - before.vel.z);
        expect(dv).toBeLessThanOrEqual(accelerationMps2 * brakingMultiplier * FIXED_DT + TOL);
        expect(dist(p.pos, before.pos)).toBeLessThanOrEqual(
          speedMps * sprintSpeedMultiplier * FIXED_DT + TOL,
        );
      }
    }
  });
});

describe('closeout beaten rule (AC2)', () => {
  const START = { x: 0, z: 3 };

  function drive(kind: 'hard' | 'guard', target: CourtPoint): { beaten: boolean; ticks: number } {
    let game = newGame();
    const pg = () => player(game, 'offense', 'PG');
    const def = () => player(game, 'defense', 'PG');
    place(pg(), START);
    let steps: Steps;
    if (kind === 'hard') {
      place(def(), { x: 0, z: -2 });
      steps = { PG: { action: 'closeoutHard', spot: { x: 0, z: -2 } } };
    } else {
      const spot = guardPoint(pg(), GUARD_CUSHION_M);
      place(def(), spot);
      steps = { PG: { action: 'guard', spot } };
    }
    let driving = kind === 'guard';
    for (let t = 0; t < 300; t += 1) {
      if (!driving && dist(def().pos, pg().pos) <= 2.5) driving = true;
      const actions: SimAction[] = driving
        ? [{ type: 'sprint', held: true }, moveToward(pg(), target)]
        : STAND;
      game = tick(game, steps, actions);
      if (dist(pg().pos, RIM_CENTER) <= 2.0) {
        return {
          beaten: dist(pg().pos, RIM_CENTER) < dist(def().pos, RIM_CENTER),
          ticks: t + 1,
        };
      }
    }
    throw new Error('PG never reached the rim');
  }

  it('a hard closeout is beaten by the drive', () => {
    expect(drive('hard', { x: 1.0, z: -4.6 }).beaten).toBe(true);
  });

  it.each([
    { x: 1.0, z: -4.6 },
    { x: -1.0, z: -4.6 },
    // (2.0, -4.0) from the plan stops 2.46 m from the rim and never gets inside 2.0 m.
    { x: 1.5, z: -4.4 },
  ])('a set guard defender is not beaten driving to ($x, $z)', (target) => {
    expect(drive('guard', target).beaten).toBe(false);
  });
});

describe('no steals (AC3)', () => {
  const WAYPOINTS: CourtPoint[] = [
    { x: 0, z: 3 },
    { x: 0, z: -4 },
    { x: 2, z: -3 },
    { x: -2, z: 0 },
    { x: 0, z: 3 },
  ];

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('seed %i keeps the ball held', (seed) => {
    let game = newGame(seed);
    const steps: Steps = {};
    ROLE_ORDER.forEach((role, i) => {
      const action = (
        role === 'PG' ? 'closeoutHard' : DEFENDER_ACTIONS[i % DEFENDER_ACTIONS.length]
      ) as DefenderAction;
      steps[role] = { action, spot: { x: (i - 2) * 1.2, z: -2 } };
    });
    place(player(game, 'offense', 'PG'), WAYPOINTS[0] as CourtPoint);
    let wp = 1;
    for (let t = 0; t < 600; t += 1) {
      const me = player(game, 'offense', 'PG');
      const goal = WAYPOINTS[wp] as CourtPoint;
      if (dist(me.pos, goal) < 0.3) wp = (wp + 1) % WAYPOINTS.length;
      game = tick(game, steps, [moveToward(me, WAYPOINTS[wp] as CourtPoint)]);
      expect(game.ball).toEqual({ kind: 'held', holderId: game.controlledPlayerId });
      expect(game.events.some((e) => e.type === 'mistake')).toBe(false);
    }
  });
});

describe('help and closeout behaviors', () => {
  function run(
    steps: Steps,
    pgPos: CourtPoint,
    defPos: CourtPoint,
    ticks: number,
    onTick: (g: GameState) => void = () => undefined,
  ): GameState {
    let game = newGame();
    place(player(game, 'offense', 'PG'), pgPos);
    place(player(game, 'defense', 'PG'), defPos);
    for (let t = 0; t < ticks; t += 1) {
      game = tick(game, steps, STAND);
      onTick(game);
    }
    return game;
  }

  it('help holds its spot when the ball is far from the rim', () => {
    const spot = { x: -1.5, z: -3.5 };
    const game = run({ PG: { action: 'help', spot } }, { x: 0, z: 3 }, { x: 0, z: 1.5 }, 120);
    expect(dist(player(game, 'defense', 'PG').pos, spot)).toBeLessThan(0.3);
  });

  it('help steps up on a holder near the rim', () => {
    const spot = { x: -1.5, z: -3.5 };
    const pgPos = { x: 0.8, z: -4 };
    const game = run({ PG: { action: 'help', spot } }, pgPos, spot, 90);
    const self = player(game, 'defense', 'PG');
    const pg = player(game, 'offense', 'PG');
    expect(dist(self.pos, pg.pos)).toBeLessThan(1.0);
    expect(dist(self.pos, RIM_CENTER)).toBeLessThan(dist(pg.pos, RIM_CENTER));
  });

  it('closeout breaks down to the cushion while closeoutHard runs onto the man', () => {
    const start = { x: 0, z: -2 };
    const pgPos = { x: 0, z: 3 };
    const soft = run({ PG: { action: 'closeout', spot: start } }, pgPos, start, 120);
    // The hard closeout never breaks down, so it overshoots and oscillates around its man: it
    // runs onto the man (closest approach) rather than settling at a cushion.
    let closest = Infinity;
    run({ PG: { action: 'closeoutHard', spot: start } }, pgPos, start, 120, (g) => {
      closest = Math.min(
        closest,
        dist(player(g, 'defense', 'PG').pos, player(g, 'offense', 'PG').pos),
      );
    });
    const pg = player(soft, 'offense', 'PG');
    const softDef = player(soft, 'defense', 'PG');
    expect(dist(softDef.pos, guardPoint(pg, CLOSEOUT_CUSHION_M))).toBeLessThan(0.3);
    expect(Math.hypot(softDef.vel.x, softDef.vel.z)).toBeLessThan(0.5);
    expect(closest).toBeLessThan(0.5);
  });
});
