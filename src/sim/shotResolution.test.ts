import { describe, expect, it } from 'vitest';
import { createGame, runHeadless, stepGame } from './index';
import type { CourtPoint, GameEvent, GameState, ShootingSetup, SimInput } from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_SHOOTING } from './testShooting';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const MANY_SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);

// Far from every test spot (more than contestRadiusM away), for ids 1..9.
const PARKING: readonly CourtPoint[] = [
  { x: -7, z: 6 },
  { x: -5.5, z: 6 },
  { x: -4, z: 6 },
  { x: 4, z: 6 },
  { x: 5.5, z: 6 },
  { x: 7, z: 6 },
  { x: -7, z: 4.5 },
  { x: 7, z: 4.5 },
  { x: 0, z: 6.5 },
];

interface Placement {
  pos: CourtPoint;
  vel?: CourtPoint;
}

/** Everyone parked except the `placed` players; velocities default to 0. */
function game(
  seed: number,
  placed: Record<number, Placement>,
  setup: ShootingSetup = TEST_SHOOTING,
): GameState {
  const state = structuredClone(createGame({ seed, movement: TEST_MOVEMENT, shooting: setup }));
  for (const p of state.players) {
    const placement = placed[p.id];
    p.pos = { ...(placement?.pos ?? PARKING[p.id - 1]!) };
    p.vel = { ...(placement?.vel ?? { x: 0, z: 0 }) };
  }
  return state;
}

function cloneSetup(edit: (setup: ShootingSetup) => void): ShootingSetup {
  const setup = structuredClone(TEST_SHOOTING);
  edit(setup);
  return setup;
}

type ShotEvent = Extract<GameEvent, { type: 'shotResolved' }>;

function shotEvent(events: readonly GameEvent[]): ShotEvent {
  const shot = events.find((e): e is ShotEvent => e.type === 'shotResolved');
  if (shot === undefined) {
    throw new Error('no shotResolved event');
  }
  return shot;
}

describe('shot resolution', () => {
  it.each(SEEDS)('blocks a jumper from a defender inside arm reach (seed %i)', (seed) => {
    const s = game(seed, { 0: { pos: { x: 0, z: -1 } }, 5: { pos: { x: 0, z: -1.4 } } });
    const next = stepGame(s, [{ type: 'shoot' }]);
    expect(next.events).toEqual([
      expect.objectContaining({
        type: 'shotResolved',
        shotType: 'jumper',
        blockerId: 5,
        made: false,
        reason: 'Contested shot',
      }),
      expect.objectContaining({ type: 'mistake', kind: 'turnover', reason: 'Contested shot' }),
    ]);
    expect(next.ball).toEqual({ kind: 'held', holderId: 5 });
    expect(next.lastCatch).toBeNull();
  });

  it.each(SEEDS)('never blocks a shot the defender cannot reach (seed %i)', (seed) => {
    const floater = game(seed, { 0: { pos: { x: 0, z: -3.5 } }, 5: { pos: { x: 0, z: -3.9 } } });
    const floaterShot = shotEvent(stepGame(floater, [{ type: 'floater' }]).events);
    expect(floaterShot.shotType).toBe('floater');
    expect(floaterShot.blockerId).toBeNull();

    const far = game(seed, { 0: { pos: { x: 0, z: -1 } }, 5: { pos: { x: 0, z: -2.5 } } });
    const farShot = shotEvent(stepGame(far, [{ type: 'shoot' }]).events);
    expect(farShot.shotType).toBe('jumper');
    expect(farShot.blockerId).toBeNull();
  });

  it('makes Great looks clearly more often than Bad looks over 1000 seeds', () => {
    let greatMade = 0;
    let badMade = 0;
    for (const seed of MANY_SEEDS) {
      const great = shotEvent(
        stepGame(game(seed, { 0: { pos: { x: 0, z: -1 } } }), [{ type: 'shoot' }]).events,
      );
      expect(great.look).toBe('great');
      expect(great.blockerId).toBeNull();
      if (great.made) {
        greatMade += 1;
      }

      const badState = game(seed, {
        0: { pos: { x: 0, z: -1 } },
        5: { pos: { x: 0, z: -2.2 }, vel: { x: 0, z: 3 } },
      });
      const bad = shotEvent(stepGame(badState, [{ type: 'shoot' }]).events);
      expect(bad.look).toBe('bad');
      expect(bad.blockerId).toBeNull();
      if (bad.made) {
        badMade += 1;
      }
    }
    const greatRate = greatMade / MANY_SEEDS.length;
    const badRate = badMade / MANY_SEEDS.length;
    expect(greatRate).toBeGreaterThanOrEqual(badRate + 0.3);
  });

  it('makes more threes with a higher three rating on the same draws', () => {
    const rated = (three: number): ShootingSetup =>
      cloneSetup((setup) => {
        setup.profiles.PG.shooting.three = three;
      });
    const high = rated(80);
    const low = rated(50);
    let highMade = 0;
    let lowMade = 0;
    for (const seed of MANY_SEEDS) {
      const placed = { 0: { pos: { x: 0, z: 1.5 } }, 5: { pos: { x: 0, z: 0.4 } } };
      const highShot = shotEvent(stepGame(game(seed, placed, high), [{ type: 'shoot' }]).events);
      const lowShot = shotEvent(stepGame(game(seed, placed, low), [{ type: 'shoot' }]).events);
      expect(highShot.shotType).toBe('three');
      expect(highShot.look).toBe('good');
      expect(lowShot.look).toBe('good');
      expect(highShot.blockerId).toBeNull();
      expect(lowShot.blockerId).toBeNull();
      if (lowShot.made) {
        lowMade += 1;
        expect(highShot.made).toBe(true);
      }
      if (highShot.made) {
        highMade += 1;
      }
    }
    expect(highMade).toBeGreaterThanOrEqual(lowMade + 50);
  });

  it('emits runUnsuccessful after a Bad look that was not blocked, and no mistake', () => {
    const s = game(3, {
      0: { pos: { x: 0, z: -1 } },
      5: { pos: { x: 0, z: -2.2 }, vel: { x: 0, z: 3 } },
    });
    const { events } = stepGame(s, [{ type: 'shoot' }]);
    expect(events).toHaveLength(2);
    const [shot, run] = events;
    expect(shot).toMatchObject({ type: 'shotResolved', look: 'bad', tick: s.tick + 1 });
    expect(run).toEqual({
      type: 'runUnsuccessful',
      tick: s.tick + 1,
      reason: (shot as ShotEvent).reason,
    });
    expect(events.some((e) => e.type === 'mistake')).toBe(false);
  });

  it('emits only shotResolved for a Great look', () => {
    const s = game(3, { 0: { pos: { x: 0, z: -1 } } });
    const { events } = stepGame(s, [{ type: 'shoot' }]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'shotResolved',
        tick: s.tick + 1,
        shooterId: 0,
        look: 'great',
        zone: 'midRange',
        blockerId: null,
        reason: 'Open shot',
      }),
    ]);
  });

  it('leaves a dead ball after the shot and ignores a second shot', () => {
    const s = game(4, { 0: { pos: { x: 0, z: -1 } } });
    s.lastCatch = { playerId: 0, passType: 'chestPass', tick: 0, set: true };
    const after = stepGame(s, [{ type: 'shoot' }]);
    const shot = shotEvent(after.events);
    expect(after.ball).toEqual({ kind: 'dead', shooterId: 0, made: shot.made });
    expect(after.lastCatch).toBeNull();

    const again = stepGame(after, [{ type: 'shoot' }]);
    expect(again.events).toEqual([]);
    expect(again.ball).toEqual(after.ball);
  });

  it('ignores a shot without the ball and a floater out of range; throws without a setup', () => {
    const noBall = game(5, { 0: { pos: { x: 0, z: -1 } } });
    noBall.ball = { kind: 'held', holderId: 1 };
    const ignored = stepGame(noBall, [{ type: 'shoot' }]);
    expect(ignored.events).toEqual([]);
    expect(ignored.ball).toEqual({ kind: 'held', holderId: 1 });

    const far = game(5, { 0: { pos: { x: 0, z: 2 } } });
    const farNext = stepGame(far, [{ type: 'floater' }]);
    expect(farNext.events).toEqual([]);
    expect(farNext.ball).toEqual({ kind: 'held', holderId: 0 });
    expect(farNext.rng).toEqual(far.rng);

    const bare = createGame({ seed: 5, movement: TEST_MOVEMENT });
    expect(() => stepGame(bare, [{ type: 'shoot' }])).toThrow(/shooting setup/);
  });

  it('is deterministic through runHeadless', () => {
    const inputs: SimInput[] = [
      { tick: 0, action: { type: 'move', x: 0, z: -1 } },
      { tick: 20, action: { type: 'move', x: 0, z: 0 } },
      { tick: 40, action: { type: 'shoot' } },
    ];
    const options = { seed: 42, ticks: 60, inputs, movement: TEST_MOVEMENT };
    const run = (): GameState => runHeadless({ ...options, shooting: TEST_SHOOTING });
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    // The shot was taken: player 0 no longer holds the ball (dead, or held by a blocker).
    expect(a.ball.kind === 'held' && a.ball.holderId === 0).toBe(false);
  });
});
