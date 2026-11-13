import { describe, expect, it } from 'vitest';
import {
  SHOT_REASONS,
  chooseShotType,
  createGame,
  rateLook,
  shotMakeChance,
  shotReleaseHeight,
  shotZoneAt,
} from './index';
import type { CourtPoint, GameState, ShootingSetup } from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_SHOOTING, TEST_SHOT_TUNING } from './testShooting';

const TICK = 1;
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

describe('look quality', () => {
  it('rates an uncontested layup Great', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -4.5 } } });
    expect(chooseShotType(s, 0, TICK)).toBe('layup');
    const rating = rateLook(s, 0, 'layup', TICK);
    expect(rating.look).toBe('great');
    expect(rating.reason).toBe(SHOT_REASONS.open);
    expect(rating.reason).toBe('Open shot');
    expect(rating.zone).toBe('rim');
  });

  it('rates a three Bad when a defender closes out within arm reach, Good when standing', () => {
    const closing = game(1, {
      0: { pos: { x: 0, z: 1.5 } },
      5: { pos: { x: 0, z: 0.7 }, vel: { x: 0, z: 3 } },
    });
    expect(chooseShotType(closing, 0, TICK)).toBe('three');
    const bad = rateLook(closing, 0, 'three', TICK);
    expect(bad.look).toBe('bad');
    expect(bad.reason).toBe('Contested shot');
    expect(bad.score).toBeCloseTo(0.4, 6);
    expect(bad.nearestDefenderId).toBe(5);
    expect(bad.zone).toBe('three');

    const standing = game(1, {
      0: { pos: { x: 0, z: 1.5 } },
      5: { pos: { x: 0, z: 0.7 } },
    });
    const good = rateLook(standing, 0, 'three', TICK);
    expect(good.look).toBe('good');
    expect(good.score).toBeCloseTo(0.64, 6);
  });

  it('rates a floater over a tall rim defender better than a layup from the same spot', () => {
    const setup = cloneSetup((s) => {
      s.profiles.C.reachM = 2.9;
    });
    const s = game(1, { 0: { pos: { x: 0, z: -4.3 } }, 9: { pos: { x: 0, z: -5.2 } } }, setup);
    const layup = rateLook(s, 0, 'layup', TICK);
    const floater = rateLook(s, 0, 'floater', TICK);
    expect(floater.score).toBeGreaterThan(layup.score);
    expect(layup.look).toBe('bad');
    expect(layup.reason).toBe('Contested at the rim by a bigger defender');
    expect(floater.look).toBe('good');
  });

  it('rates an off-balance jumper with the off-balance penalty', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -1 }, vel: { x: 3, z: 0 } } });
    const rating = rateLook(s, 0, 'jumper', TICK);
    expect(rating.score).toBeCloseTo(1 - TEST_SHOT_TUNING.offBalancePenalty, 6);
    expect(rating.look).toBe('good');
    expect(rating.reason).toBe('Off-balance shot');
  });

  it('rates a jumper off-balance right after an unset catch', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -1 } } });
    s.lastCatch = { playerId: 0, passType: 'chestPass', tick: 10, set: false };
    const rating = rateLook(s, 0, 'jumper', 20);
    expect(rating.reason).toBe('Off-balance shot');
    expect(rateLook(s, 0, 'jumper', 41).look).toBe('great');
  });

  it('rates a three Bad as out of range when the zone rating is below the floor', () => {
    const setup = cloneSetup((s) => {
      s.profiles.PG.shooting.three = 20;
    });
    const s = game(1, { 0: { pos: { x: 0, z: 1.5 } } }, setup);
    const rating = rateLook(s, 0, 'three', TICK);
    expect(rating.look).toBe('bad');
    expect(rating.reason).toBe('Shot out of range');
  });

  it('rates a shot beyond maxRangeM out of range', () => {
    const s = game(1, { 0: { pos: { x: 0, z: 4 } } });
    expect(rateLook(s, 0, 'three', TICK).reason).toBe('Shot out of range');
  });

  it('contests less when the nearest defender is beaten (farther from the rim)', () => {
    const behind = game(1, { 0: { pos: { x: 0, z: -1 } }, 5: { pos: { x: 0, z: 0 } } });
    const front = game(1, { 0: { pos: { x: 0, z: -1 } }, 5: { pos: { x: 0, z: -2 } } });
    const beaten = rateLook(behind, 0, 'jumper', TICK);
    const facing = rateLook(front, 0, 'jumper', TICK);
    expect(beaten.score).toBeGreaterThan(facing.score);
    expect(beaten.score).toBeCloseTo(0.85, 6);
    expect(facing.score).toBeCloseTo(0.7, 6);
  });

  it('does not mutate the state', () => {
    const s = game(1, { 0: { pos: { x: 0, z: 1.5 } }, 5: { pos: { x: 0, z: 0.7 } } });
    const before = structuredClone(s);
    rateLook(s, 0, 'three', TICK);
    chooseShotType(s, 0, TICK);
    expect(s).toEqual(before);
  });

  it('throws for a game without shooting or an unknown shooter', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -1 } } });
    expect(() => rateLook(s, 42, 'jumper', TICK)).toThrow(/Court Vision/);
    const bare = createGame({ seed: 1, movement: TEST_MOVEMENT });
    expect(() => rateLook(bare, 0, 'jumper', TICK)).toThrow(/Court Vision/);
    expect(() => chooseShotType(bare, 0, TICK)).toThrow(/Court Vision/);
  });
});

describe('shot selection', () => {
  it('picks a layup at the rim even when moving', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -4.5 }, vel: { x: 3, z: 0 } } });
    expect(chooseShotType(s, 0, TICK)).toBe('layup');
  });

  it('picks a three beyond the arc and a jumper inside it when standing', () => {
    expect(chooseShotType(game(1, { 0: { pos: { x: 0, z: 1.5 } } }), 0, TICK)).toBe('three');
    expect(chooseShotType(game(1, { 0: { pos: { x: 0, z: -1 } } }), 0, TICK)).toBe('jumper');
  });

  it('picks a pull-up off the dribble', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -1 }, vel: { x: 1.5, z: 0 } } });
    expect(chooseShotType(s, 0, TICK)).toBe('pullUp');
  });

  it('picks catch-and-shoot only within the window after a set catch', () => {
    const s = game(1, { 0: { pos: { x: 0, z: -1 } } });
    s.lastCatch = { playerId: 0, passType: 'chestPass', tick: 10, set: true };
    expect(chooseShotType(s, 0, 20)).toBe('catchAndShoot');
    expect(chooseShotType(s, 0, 40)).toBe('catchAndShoot');
    expect(chooseShotType(s, 0, 41)).toBe('jumper');
    s.lastCatch = { playerId: 0, passType: 'chestPass', tick: 10, set: false };
    expect(chooseShotType(s, 0, 20)).toBe('jumper');
    s.lastCatch = { playerId: 1, passType: 'chestPass', tick: 10, set: true };
    expect(chooseShotType(s, 0, 20)).toBe('jumper');
  });
});

describe('shot zones and release heights', () => {
  it('maps spots to zones', () => {
    expect(shotZoneAt({ x: 0, z: -4.5 }, TEST_SHOT_TUNING)).toBe('rim');
    expect(shotZoneAt({ x: 0, z: -1 }, TEST_SHOT_TUNING)).toBe('midRange');
    expect(shotZoneAt({ x: 0, z: 1.5 }, TEST_SHOT_TUNING)).toBe('three');
  });

  it('releases a floater highest and a jump shot lowest', () => {
    expect(shotReleaseHeight('layup', TEST_SHOT_TUNING)).toBe(2.8);
    expect(shotReleaseHeight('floater', TEST_SHOT_TUNING)).toBe(3.6);
    for (const type of ['jumper', 'three', 'pullUp', 'catchAndShoot'] as const) {
      expect(shotReleaseHeight(type, TEST_SHOT_TUNING)).toBe(2.6);
    }
  });
});

describe('shotMakeChance', () => {
  it('orders looks at rating 50', () => {
    const great = shotMakeChance('great', 50, TEST_SHOT_TUNING);
    const good = shotMakeChance('good', 50, TEST_SHOT_TUNING);
    const bad = shotMakeChance('bad', 50, TEST_SHOT_TUNING);
    expect(great).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(bad);
    expect(great).toBeCloseTo(0.65, 6);
  });

  it('rises with the zone rating', () => {
    expect(shotMakeChance('good', 80, TEST_SHOT_TUNING)).toBeGreaterThan(
      shotMakeChance('good', 50, TEST_SHOT_TUNING),
    );
  });

  it('clamps to [minMakeChance, maxMakeChance]', () => {
    const tuning = { ...TEST_SHOT_TUNING, zoneRatingWeight: 5 };
    expect(shotMakeChance('great', 100, tuning)).toBe(TEST_SHOT_TUNING.maxMakeChance);
    expect(shotMakeChance('bad', 0, tuning)).toBe(TEST_SHOT_TUNING.minMakeChance);
  });
});

describe('createGame shooting validation', () => {
  function create(setup: ShootingSetup): GameState {
    return createGame({ seed: 1, movement: TEST_MOVEMENT, shooting: setup });
  }

  it('throws on invalid ratings and tuning', () => {
    expect(() =>
      create(
        cloneSetup((s) => {
          s.profiles.SF.shooting.midRange = 101;
        }),
      ),
    ).toThrow(/Court Vision/);
    expect(() =>
      create(
        cloneSetup((s) => {
          s.tuning.greatMinScore = s.tuning.goodMinScore;
        }),
      ),
    ).toThrow(/Court Vision/);
    expect(() =>
      create(
        cloneSetup((s) => {
          s.tuning.badMakeChance = s.tuning.goodMakeChance + 0.01;
        }),
      ),
    ).toThrow(/Court Vision/);
    expect(() =>
      create(
        cloneSetup((s) => {
          s.tuning.catchAndShootWindowTicks = 30.5;
        }),
      ),
    ).toThrow(/Court Vision/);
  });

  it('accepts the fixture', () => {
    expect(() => create(TEST_SHOOTING)).not.toThrow();
  });

  it('leaves shooting null without the option', () => {
    expect(createGame({ seed: 1, movement: TEST_MOVEMENT }).shooting).toBeNull();
  });

  it('clones the setup instead of aliasing it', () => {
    const setup = structuredClone(TEST_SHOOTING);
    const state = create(setup);
    expect(state.shooting).toEqual(setup);
    expect(state.shooting).not.toBe(setup);
    setup.profiles.PG.reachM = 9;
    setup.tuning.contestWeight = 0;
    expect(state.shooting?.profiles.PG.reachM).toBe(2.6);
    expect(state.shooting?.tuning.contestWeight).toBe(0.6);
  });
});
