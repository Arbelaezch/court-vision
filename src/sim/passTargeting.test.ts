import { describe, expect, it } from 'vitest';
import {
  PASS_TARGET_BADGE_LABELS,
  PASS_TARGET_KEYS,
  PASS_TARGET_KEY_ROLES,
  createGame,
  passTargetBadges,
  passTargetKeyForRole,
  resolvePassTarget,
} from './index';
import type {
  CourtPoint,
  GameState,
  PassTargetKey,
  PassTargetingMode,
  PlayerState,
  RoleId,
} from './index';
import { TEST_MOVEMENT } from './testMovement';

const MODES: readonly PassTargetingMode[] = ['numbered', 'aim', 'both'];

/** Point at `deg` clockwise from straight up the court (-z), `r` metres from the origin. */
function polar(deg: number, r: number): CourtPoint {
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.sin(rad), z: -r * Math.cos(rad) };
}

function fresh(): GameState {
  return structuredClone(createGame({ seed: 1, movement: TEST_MOVEMENT }));
}

function byRole(state: GameState, role: RoleId, side: 'offense' | 'defense' = 'offense') {
  return state.players.find((p) => p.side === side && p.role === role)!;
}

/** PG at the origin; SG 0, SF 100, PF -100, C 180 degrees at 5 m; defenders parked far behind. */
function layout(): GameState {
  const state = fresh();
  const spots: Partial<Record<RoleId, CourtPoint>> = {
    PG: { x: 0, z: 0 },
    SG: polar(0, 5),
    SF: polar(100, 5),
    PF: polar(-100, 5),
    C: polar(180, 5),
  };
  for (const p of state.players) {
    p.pos = p.side === 'offense' ? { ...spots[p.role]! } : { x: -9 + p.id, z: 12 };
  }
  return state;
}

function setSpot(state: GameState, role: RoleId, pos: CourtPoint): PlayerState {
  const p = byRole(state, role);
  p.pos = { ...pos };
  return p;
}

const settings = (mode: PassTargetingMode, aimSensitivity = 1) => ({ mode, aimSensitivity });

describe('resolvePassTarget numbered', () => {
  it.each([
    [1, 'SG'],
    [2, 'SF'],
    [3, 'PF'],
    [4, 'C'],
  ] as const)('key %i returns the %s', (key, role) => {
    const state = layout();
    expect(resolvePassTarget(state, { key, aimAt: null }, settings('numbered'))).toBe(
      byRole(state, role).id,
    );
  });

  it('maps by role, not id, when roles are swapped', () => {
    const state = layout();
    const sg = byRole(state, 'SG');
    const c = byRole(state, 'C');
    sg.role = 'C';
    c.role = 'SG';
    expect(resolvePassTarget(state, { key: 1, aimAt: null }, settings('numbered'))).toBe(c.id);
    expect(resolvePassTarget(state, { key: 4, aimAt: null }, settings('numbered'))).toBe(sg.id);
  });

  it('ignores the aim point', () => {
    const state = layout();
    expect(
      resolvePassTarget(state, { key: null, aimAt: polar(0, 5) }, settings('numbered')),
    ).toBeNull();
    expect(resolvePassTarget(state, { key: 2, aimAt: polar(180, 5) }, settings('numbered'))).toBe(
      byRole(state, 'SF').id,
    );
  });
});

describe('resolvePassTarget aim', () => {
  it('picks the teammate nearest the aim bearing', () => {
    const state = layout();
    expect(resolvePassTarget(state, { key: null, aimAt: polar(95, 3) }, settings('aim'))).toBe(
      byRole(state, 'SF').id,
    );
  });

  it('picks the smaller angle when aiming between two teammates', () => {
    const state = layout();
    setSpot(state, 'SF', polar(40, 5));
    expect(resolvePassTarget(state, { key: null, aimAt: polar(15, 5) }, settings('aim'))).toBe(
      byRole(state, 'SG').id,
    );
    expect(resolvePassTarget(state, { key: null, aimAt: polar(25, 5) }, settings('aim'))).toBe(
      byRole(state, 'SF').id,
    );
  });

  it('breaks an exact angle tie with the nearer teammate', () => {
    const state = layout();
    setSpot(state, 'SG', polar(0, 8));
    setSpot(state, 'SF', polar(0, 4));
    expect(resolvePassTarget(state, { key: null, aimAt: polar(0, 6) }, settings('aim'))).toBe(
      byRole(state, 'SF').id,
    );
  });

  it('ignores keys', () => {
    const state = layout();
    expect(resolvePassTarget(state, { key: 4, aimAt: polar(0, 5) }, settings('aim'))).toBe(
      byRole(state, 'SG').id,
    );
    expect(resolvePassTarget(state, { key: 4, aimAt: null }, settings('aim'))).toBeNull();
  });

  it('falls back to the closest angle when the cone is empty', () => {
    const state = layout();
    // Only SG is near the aim side; aim 60 degrees off it, with the rest more than 100 degrees away.
    const aim = polar(-60, 5);
    setSpot(state, 'PF', polar(150, 5));
    setSpot(state, 'SF', polar(120, 5));
    setSpot(state, 'C', polar(180, 5));
    // SG at 0 is 60 off: outside the 45 degree cone at sensitivity 1, still chosen by fallback.
    expect(resolvePassTarget(state, { key: null, aimAt: aim }, settings('aim', 1))).toBe(
      byRole(state, 'SG').id,
    );
    expect(resolvePassTarget(state, { key: null, aimAt: aim }, settings('aim', 2))).toBe(
      byRole(state, 'SG').id,
    );
  });

  it('returns null when aiming at the holder', () => {
    const state = layout();
    expect(
      resolvePassTarget(state, { key: null, aimAt: { x: 0, z: 0 } }, settings('aim')),
    ).toBeNull();
  });

  it('never returns the holder or a defender', () => {
    const state = layout();
    const defender = byRole(state, 'SG', 'defense');
    defender.pos = polar(0, 2);
    const id = resolvePassTarget(state, { key: null, aimAt: polar(0, 2) }, settings('aim'));
    expect(id).not.toBeNull();
    const target = state.players.find((p) => p.id === id)!;
    expect(target.side).toBe('offense');
    expect(id).not.toBe(state.controlledPlayerId);
  });
});

describe('resolvePassTarget both', () => {
  it('uses a key alone', () => {
    const state = layout();
    expect(resolvePassTarget(state, { key: 3, aimAt: null }, settings('both'))).toBe(
      byRole(state, 'PF').id,
    );
  });

  it('uses the aim point alone', () => {
    const state = layout();
    expect(resolvePassTarget(state, { key: null, aimAt: polar(180, 4) }, settings('both'))).toBe(
      byRole(state, 'C').id,
    );
  });

  it('lets the key win over the aim point', () => {
    const state = layout();
    expect(resolvePassTarget(state, { key: 1, aimAt: polar(180, 4) }, settings('both'))).toBe(
      byRole(state, 'SG').id,
    );
  });

  it('returns null with neither', () => {
    expect(resolvePassTarget(layout(), { key: null, aimAt: null }, settings('both'))).toBeNull();
  });
});

describe('resolvePassTarget holder gating', () => {
  const intents = [
    { key: 1 as PassTargetKey, aimAt: polar(0, 5) },
    { key: null, aimAt: polar(0, 5) },
  ];

  it.each(MODES)('returns null in %s when the ball is dead', (mode) => {
    const state = layout();
    state.ball = { kind: 'dead', shooterId: 0, made: false };
    for (const intent of intents) {
      expect(resolvePassTarget(state, intent, settings(mode))).toBeNull();
    }
  });

  it.each(MODES)('returns null in %s when another player holds the ball', (mode) => {
    const state = layout();
    state.ball = { kind: 'held', holderId: 1 };
    for (const intent of intents) {
      expect(resolvePassTarget(state, intent, settings(mode))).toBeNull();
    }
  });
});

describe('resolvePassTarget validation', () => {
  it('throws for an unknown mode', () => {
    expect(() =>
      resolvePassTarget(
        layout(),
        { key: 1, aimAt: null },
        {
          mode: 'mind' as PassTargetingMode,
          aimSensitivity: 1,
        },
      ),
    ).toThrow(/^Court Vision:/);
  });

  it.each([0, -1, NaN])('throws for aimSensitivity %s', (aimSensitivity) => {
    expect(() =>
      resolvePassTarget(layout(), { key: 1, aimAt: null }, { mode: 'both', aimSensitivity }),
    ).toThrow(/^Court Vision:/);
  });

  it('throws for key 5', () => {
    expect(() =>
      resolvePassTarget(layout(), { key: 5 as PassTargetKey, aimAt: null }, settings('both')),
    ).toThrow(/^Court Vision:/);
  });
});

describe('passTargetBadges', () => {
  it('lists four badges with number plus role labels', () => {
    const state = fresh();
    const badges = passTargetBadges(state);
    expect(badges.map((b) => b.label)).toEqual(['1 SG', '2 SF', '3 PF', '4 C']);
    for (const b of badges) {
      expect(b.role).toBe(PASS_TARGET_KEY_ROLES[b.key]);
      const p = state.players.find((q) => q.id === b.playerId)!;
      expect(p.side).toBe('offense');
      expect(p.role).toBe(b.role);
    }
    expect(badges.map((b) => b.key)).toEqual([...PASS_TARGET_KEYS]);
  });

  it('is empty when the PG does not hold the ball', () => {
    const dead = fresh();
    dead.ball = { kind: 'dead', shooterId: 0, made: false };
    expect(passTargetBadges(dead)).toEqual([]);
    const other = fresh();
    other.ball = { kind: 'held', holderId: 1 };
    expect(passTargetBadges(other)).toEqual([]);
  });

  it('exposes the label list', () => {
    expect(PASS_TARGET_BADGE_LABELS).toEqual(['1 SG', '2 SF', '3 PF', '4 C']);
  });
});

describe('passTargetKeyForRole', () => {
  it('maps roles to keys and the PG to null', () => {
    expect(passTargetKeyForRole('SG')).toBe(1);
    expect(passTargetKeyForRole('SF')).toBe(2);
    expect(passTargetKeyForRole('PF')).toBe(3);
    expect(passTargetKeyForRole('C')).toBe(4);
    expect(passTargetKeyForRole('PG')).toBeNull();
  });
});
