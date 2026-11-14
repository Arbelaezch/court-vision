import { describe, expect, it } from 'vitest';
import { loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import {
  RIM_CENTER,
  RIM_HEIGHT,
  createGame,
  passHeightAt,
  stepGame,
  type GameState,
  type PassType,
  type SimAction,
} from '../sim';
import type { CharacterPose } from './characters';
import {
  BALL_CARRY_HEIGHT_M,
  BALL_DRIBBLE_HIGH_M,
  BALL_DRIBBLE_LOW_M,
  BALL_RADIUS_M,
  SHOT_ARC_RISE_M,
  ballRenderPosition,
  interpolatePlayers,
  shotArcFromStep,
  shotArcPosition,
  type ShotResolvedEvent,
} from './simInterpolation';

function newGame(): GameState {
  return createGame({
    seed: 1,
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
    defenseMode: 'cones',
  });
}

function sgId(state: GameState): number {
  const sg = state.players.find((p) => p.role === 'SG' && p.side === 'offense');
  if (!sg) throw new Error('no SG');
  return sg.id;
}

function posesOf(state: GameState): CharacterPose[] {
  return interpolatePlayers(state, state, 0, () => 'idle');
}

/** Steps with the given first-step actions, then idles; returns every state. */
function record(
  first: SimAction[],
  ticks: number,
  start: GameState = newGame(),
  commands: Parameters<typeof stepGame>[2] = [],
): GameState[] {
  const states = [start];
  let s = start;
  for (let i = 0; i < ticks; i++) {
    s = stepGame(s, i === 0 ? first : [], i === 0 ? commands : []);
    states.push(s);
  }
  return states;
}

describe('interpolatePlayers', () => {
  it('lerps from prev to curr and never aliases snapshot objects', () => {
    const states = record([{ type: 'move', x: 1, z: 0 }], 10);
    const prev = states[4]!;
    const curr = states[5]!;
    const id = curr.controlledPlayerId;
    const find = (poses: CharacterPose[]) => poses.find((p) => p.id === id)!;
    const p0 = find(interpolatePlayers(prev, curr, 0, () => 'run'));
    const p5 = find(interpolatePlayers(prev, curr, 0.5, () => 'run'));
    const before = prev.players.find((p) => p.id === id)!;
    const after = curr.players.find((p) => p.id === id)!;
    expect(p0.pos.x).toBeCloseTo(before.pos.x, 12);
    expect(p5.pos.x).toBeCloseTo((before.pos.x + after.pos.x) / 2, 12);
    expect(after.pos.x).toBeGreaterThan(before.pos.x);
    expect(p0.pos).not.toBe(before.pos);
    expect(p0.pos).not.toBe(after.pos);
    expect(p0.vel).not.toBe(after.vel);
    expect(p0.anim).toBe('run');
  });
});

describe.each<PassType>(['bouncePass', 'lob'])('%s ball path', (passType) => {
  it('follows the sim ball and its height profile', () => {
    const game = newGame();
    const states = record([{ type: 'pass', passType, targetId: sgId(game) }], 60, game);
    const tuning = game.passing!.tuning;
    const sampled: number[] = [];
    let checked = 0;
    for (let k = 1; k < states.length; k++) {
      const prev = states[k - 1]!;
      const curr = states[k]!;
      if (prev.ball.kind !== 'inFlight' || curr.ball.kind !== 'inFlight') continue;
      const pos = ballRenderPosition(prev, curr, 0, posesOf(curr), null);
      expect(pos.x).toBeCloseTo(prev.ball.pos.x, 12);
      expect(pos.y).toBeCloseTo(prev.ball.pos.y, 12);
      expect(pos.z).toBeCloseTo(prev.ball.pos.z, 12);
      const expected = passHeightAt(
        passType,
        prev.ball.elapsedTicks / prev.ball.flightTicks,
        tuning,
      );
      expect(Math.abs(pos.y - expected)).toBeLessThan(1e-9);
      sampled.push(pos.y);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
    if (passType === 'bouncePass') {
      expect(Math.min(...sampled)).toBeLessThan(0.15);
    } else {
      expect(Math.max(...sampled)).toBeGreaterThan(tuning.lob.apexHeightM - 0.3);
      expect(Math.max(...sampled)).toBeLessThanOrEqual(tuning.lob.apexHeightM + 0.05);
    }
  });
});

function shotStates(placeNearRim: boolean): {
  states: GameState[];
  event: ShotResolvedEvent;
  k: number;
} {
  const game = newGame();
  const id = game.controlledPlayerId;
  const commands = placeNearRim
    ? [{ type: 'place' as const, playerId: id, x: 0, z: RIM_CENTER.z + 1 }]
    : [];
  const states = record([], 2, game, commands);
  for (let i = 0; i < 400; i++) {
    const next = stepGame(states[states.length - 1]!, i === 0 ? [{ type: 'shoot' }] : []);
    states.push(next);
    const ev = next.events.find((e) => e.type === 'shotResolved');
    if (ev && ev.type === 'shotResolved') return { states, event: ev, k: states.length - 1 };
  }
  throw new Error('no shot resolved');
}

describe('shot arc', () => {
  it('starts at release height, reaches the rim, peaks above, then rests on the floor', () => {
    const { states, event, k } = shotStates(false);
    const prev = states[k - 1]!;
    const curr = states[k]!;
    const arc = shotArcFromStep(prev, curr, event);
    expect(arc).not.toBeNull();
    if (!arc) return;
    const start = shotArcPosition(arc, arc.startTick);
    expect(start.y).toBeCloseTo(arc.from.y, 9);
    const end = shotArcPosition(arc, arc.startTick + arc.flightTicks);
    expect(end.y).toBeCloseTo(RIM_HEIGHT, 9);
    if (event.made) {
      expect(end.x).toBeCloseTo(RIM_CENTER.x, 9);
      expect(end.z).toBeCloseTo(RIM_CENTER.z, 9);
    }
    const mid = shotArcPosition(arc, arc.startTick + arc.flightTicks / 2);
    expect(mid.y).toBeGreaterThan(Math.max(arc.from.y, arc.to.y));
    expect(arc.apexM).toBeGreaterThanOrEqual(Math.max(arc.from.y, arc.to.y) + 0.4 - 1e-9);
    expect(arc.apexM).toBeLessThanOrEqual(Math.max(arc.from.y, arc.to.y) + SHOT_ARC_RISE_M + 1e-9);
    const rest = shotArcPosition(arc, arc.startTick + arc.flightTicks + 600);
    expect(rest.y).toBeCloseTo(BALL_RADIUS_M, 12);
    // The release step blends from the held ball to the arc, so there is no snap overhead.
    const poses = posesOf(curr);
    const atStart = ballRenderPosition(prev, curr, 0, poses, arc);
    expect(atStart.y).toBeLessThanOrEqual(BALL_CARRY_HEIGHT_M + 1e-9);
    const atEnd = ballRenderPosition(prev, curr, 1, poses, arc);
    const onArc = shotArcPosition(arc, arc.startTick + 1);
    expect(atEnd.x).toBeCloseTo(onArc.x, 9);
    expect(atEnd.y).toBeCloseTo(onArc.y, 9);
    expect(atEnd.z).toBeCloseTo(onArc.z, 9);
  });

  it('returns null for a blocked shot', () => {
    const { states, event, k } = shotStates(false);
    const blocked = { ...event, blockerId: 7 };
    expect(shotArcFromStep(states[k - 1]!, states[k]!, blocked)).toBeNull();
  });
});

describe('held ball', () => {
  it('stays within the dribble band while dribbling and at carry height otherwise', () => {
    const state = newGame();
    const holder = state.players.find((p) => p.id === state.controlledPlayerId)!;
    const base: CharacterPose = { id: holder.id, pos: { ...holder.pos }, vel: { x: 0, z: 0 } };
    const heights = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const s = { ...state, tick: i * 3 };
      const y = ballRenderPosition(s, s, 0, [{ ...base, anim: 'dribble' }], null).y;
      expect(y).toBeGreaterThanOrEqual(BALL_DRIBBLE_LOW_M - 1e-9);
      expect(y).toBeLessThanOrEqual(BALL_DRIBBLE_HIGH_M + 1e-9);
      heights.add(Math.round(y * 1e6));
    }
    expect(heights.size).toBeGreaterThan(1);
    const carried = ballRenderPosition(state, state, 0, [{ ...base, anim: 'idle' }], null);
    expect(carried.y).toBe(BALL_CARRY_HEIGHT_M);
  });

  it('keeps the same held height when the holder anim changes between catch, dribble and pass', () => {
    const state = newGame();
    const holder = state.players.find((p) => p.id === state.controlledPlayerId)!;
    const base: CharacterPose = { id: holder.id, pos: { ...holder.pos }, vel: { x: 0, z: 0 } };
    for (let i = 0; i < 20; i++) {
      const s = { ...state, tick: i * 3 };
      const yOf = (anim: CharacterPose['anim']): number =>
        ballRenderPosition(s, s, 0, [{ ...base, anim }], null).y;
      const dribble = yOf('dribble');
      for (const anim of ['catch', 'pass', 'shoot', 'layup', 'screen'] as const) {
        expect(yOf(anim)).toBeCloseTo(dribble, 12);
      }
    }
  });
});
