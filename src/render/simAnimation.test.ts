import { describe, expect, it } from 'vitest';
import { loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import { FIXED_DT, RIM_CENTER, createGame, stepGame } from '../sim';
import type { GameState, PlayerCommand, SimAction } from '../sim';
import { ANIM_ONE_SHOT_S, createSimAnimTracker } from './simAnimation';
import type { SimSnapshot } from './simInterpolation';

function newGame(): GameState {
  return createGame({
    seed: 1,
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
    defenseMode: 'cones',
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function sgId(state: GameState): number {
  return state.players.find((p) => p.role === 'SG' && p.side === 'offense')!.id;
}

function run(
  start: GameState,
  ticks: number,
  actionsAt: (i: number) => SimAction[] = () => [],
  commandsAt: (i: number) => PlayerCommand[] = () => [],
): GameState[] {
  const states = [start];
  for (let i = 0; i < ticks; i++) {
    states.push(stepGame(states[i]!, actionsAt(i), commandsAt(i)));
  }
  return states;
}

function player(state: SimSnapshot, id: number) {
  return state.players.find((p) => p.id === id)!;
}

describe('createSimAnimTracker', () => {
  it('maps locomotion states by speed and sprint', () => {
    const game = newGame();
    const pg = game.controlledPlayerId;
    const other = game.players.find((p) => p.side === 'offense' && p.id !== pg && p.role !== 'SG')!;
    const t = createSimAnimTracker();
    const states = run(
      game,
      30,
      (i) => (i === 0 ? [{ type: 'move', x: 1, z: 0 }] : []),
      (i) => (i === 0 ? [{ type: 'steer', playerId: other.id, x: 1, z: 0 }] : []),
    );
    for (let i = 1; i < states.length; i++) t.observe(states[i - 1]!, states[i]!);
    const last = states[states.length - 1]!;
    expect(t.animFor(player(last, other.id), last)).toBe('run');
    expect(t.animFor(player(last, pg), last)).toBe('dribble');
    const sprinting = structuredClone(last);
    sprinting.players.find((p) => p.id === other.id)!.sprinting = true;
    expect(t.animFor(player(sprinting, other.id), sprinting)).toBe('sprint');
    const still = states[0]!;
    expect(t.animFor(player(still, other.id), still)).toBe('idle');
  });

  it('plays pass then catch one-shots and expires them', () => {
    const game = newGame();
    const pg = game.controlledPlayerId;
    const sg = sgId(game);
    const states = run(game, 120, (i) =>
      i === 0 ? [{ type: 'pass', passType: 'chestPass', targetId: sg }] : [],
    );
    const t = createSimAnimTracker();
    let release = -1;
    let catchStep = -1;
    for (let k = 1; k < states.length; k++) {
      const prev = states[k - 1]!;
      const curr = states[k]!;
      t.observe(prev, curr);
      if (release < 0 && prev.ball.kind === 'held' && curr.ball.kind === 'inFlight') {
        release = k;
        expect(t.animFor(player(curr, pg), curr)).toBe('pass');
      }
      if (catchStep < 0 && prev.ball.kind === 'inFlight' && curr.ball.kind === 'held') {
        catchStep = k;
        expect(t.animFor(player(curr, sg), curr)).toBe('catch');
      }
    }
    expect(release).toBeGreaterThan(0);
    expect(catchStep).toBeGreaterThan(release);
    const last = states[states.length - 1]!;
    expect(t.animFor(player(last, pg), last)).toBe('idle');
    expect(t.animFor(player(last, sg), last)).toBe('dribble');

    // The passer returns to its base state after the pass duration.
    const t2 = createSimAnimTracker();
    const state: string[] = [];
    for (let k = 1; k < states.length; k++) {
      t2.observe(states[k - 1]!, states[k]!);
      state.push(t2.animFor(player(states[k]!, pg), states[k]!));
    }
    const steps = Math.ceil(ANIM_ONE_SHOT_S.pass / FIXED_DT);
    expect(state[release - 1 + steps - 2]).toBe('pass');
    expect(state[release - 1 + steps + 1]).not.toBe('pass');
  });

  it('plays shoot (or layup) on the shot step and exposes the arc until the ball is live', () => {
    for (const nearRim of [false, true]) {
      const game = newGame();
      const pg = game.controlledPlayerId;
      if (nearRim) {
        const p = game.players.find((q) => q.id === pg)!;
        p.pos = { x: RIM_CENTER.x, z: RIM_CENTER.z + 1 };
      }
      const states = run(game, 10, (i) => (i === 5 ? [{ type: 'shoot' }] : []));
      const t = createSimAnimTracker();
      let seen = false;
      for (let k = 1; k < states.length; k++) {
        t.observe(states[k - 1]!, states[k]!);
        const ev = states[k]!.events.find((e) => e.type === 'shotResolved');
        if (ev && ev.type === 'shotResolved') {
          seen = true;
          const expected = ev.shotType === 'layup' || ev.shotType === 'floater' ? 'layup' : 'shoot';
          expect(t.animFor(player(states[k]!, pg), states[k]!)).toBe(expected);
          expect(t.shotArc()).not.toBeNull();
          if (nearRim) expect(expected).toBe('layup');
        }
      }
      expect(seen).toBe(true);
    }
  });

  it('plays screen from extra events, and reset clears timers and arc', () => {
    const game = newGame();
    const screener = game.players.find((p) => p.role === 'C' && p.side === 'offense')!;
    const next = stepGame(game, []);
    const t = createSimAnimTracker();
    t.observe(game, next, [
      {
        type: 'screenSet',
        tick: next.tick,
        screenerId: screener.id,
        targetId: game.controlledPlayerId,
      },
    ]);
    expect(t.animFor(player(next, screener.id), next)).toBe('screen');
    t.reset();
    expect(t.animFor(player(next, screener.id), next)).toBe('idle');
    expect(t.shotArc()).toBeNull();
  });

  it('observes deep-frozen snapshots without throwing', () => {
    const game = newGame();
    const sg = sgId(game);
    const states = run(game, 80, (i) =>
      i === 0
        ? [{ type: 'pass', passType: 'lob', targetId: sg }]
        : i === 70
          ? [{ type: 'shoot' }]
          : [],
    );
    states.forEach((s) => deepFreeze(s));
    const t = createSimAnimTracker();
    expect(() => {
      for (let k = 1; k < states.length; k++) {
        t.observe(states[k - 1]!, states[k]!);
        for (const p of states[k]!.players) t.animFor(p, states[k]!);
      }
    }).not.toThrow();
  });
});
