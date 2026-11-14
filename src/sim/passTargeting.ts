// Pure pass-target resolution: number keys (by role) and aim point, plus the key badge model.
import { ROLE_ORDER } from './state';
import type { CourtPoint, GameState, PlayerState, RoleId } from './state';

export type PassTargetingMode = 'numbered' | 'aim' | 'both';
export const PASS_TARGETING_MODES: readonly PassTargetingMode[] = ['numbered', 'aim', 'both'];

export type PassTargetKey = 1 | 2 | 3 | 4;
export const PASS_TARGET_KEYS: readonly PassTargetKey[] = [1, 2, 3, 4];

/** Position order (g7): the key picks the teammate by role, not by id. */
export const PASS_TARGET_KEY_ROLES: Readonly<Record<PassTargetKey, RoleId>> = {
  1: 'SG',
  2: 'SF',
  3: 'PF',
  4: 'C',
};

/** Aim cone half-angle at aimSensitivity 1; scaled by the sensitivity. */
export const AIM_CONE_HALF_ANGLE_DEG = 45;

export interface PassTargetIntent {
  key: PassTargetKey | null;
  aimAt: CourtPoint | null;
}

export interface PassTargetingSettings {
  mode: PassTargetingMode;
  aimSensitivity: number;
}

export function passTargetBadgeLabel(key: PassTargetKey): string {
  return `${key} ${PASS_TARGET_KEY_ROLES[key]}`;
}

/** Reverse of PASS_TARGET_KEY_ROLES: the key that picks `role`, or null (the PG has none). */
export function passTargetKeyForRole(role: RoleId): PassTargetKey | null {
  return PASS_TARGET_KEYS.find((key) => PASS_TARGET_KEY_ROLES[key] === role) ?? null;
}

export const PASS_TARGET_BADGE_LABELS: readonly string[] =
  PASS_TARGET_KEYS.map(passTargetBadgeLabel);

const EPSILON = 1e-6;
const TIE_EPSILON = 1e-9;

function controlledHolder(state: GameState): PlayerState | null {
  if (state.ball.kind !== 'held' || state.ball.holderId !== state.controlledPlayerId) {
    return null;
  }
  return state.players.find((p) => p.id === state.controlledPlayerId) ?? null;
}

function teammatesOf(state: GameState, holder: PlayerState): PlayerState[] {
  return state.players.filter((p) => p.side === holder.side && p.id !== holder.id);
}

/**
 * Resolves the teammate to pass to, or null. A number key always wins in 'both'. The aim path picks
 * the smallest angle inside a cone of AIM_CONE_HALF_ANGLE_DEG x aimSensitivity degrees, and falls
 * back to the closest angle overall when the cone is empty.
 */
export function resolvePassTarget(
  state: GameState,
  intent: PassTargetIntent,
  settings: PassTargetingSettings,
): number | null {
  if (!PASS_TARGETING_MODES.includes(settings.mode)) {
    throw new Error(`Court Vision: unknown pass targeting mode "${String(settings.mode)}"`);
  }
  if (!Number.isFinite(settings.aimSensitivity) || settings.aimSensitivity <= 0) {
    throw new Error(
      `Court Vision: aimSensitivity must be a finite number > 0, got ${settings.aimSensitivity}`,
    );
  }
  if (intent.key !== null && !PASS_TARGET_KEYS.includes(intent.key)) {
    throw new Error(`Court Vision: pass target key must be 1-4, got ${String(intent.key)}`);
  }
  const holder = controlledHolder(state);
  if (holder === null) {
    return null;
  }
  const teammates = teammatesOf(state, holder);

  const useKey = settings.mode !== 'aim' && intent.key !== null;
  if (useKey) {
    const role = PASS_TARGET_KEY_ROLES[intent.key!];
    return teammates.find((t) => t.role === role)?.id ?? null;
  }
  // 'numbered' never reads the aim point; 'both' with a key already returned above.
  if (settings.mode === 'numbered' || intent.aimAt === null) {
    return null;
  }

  const dx = intent.aimAt.x - holder.pos.x;
  const dz = intent.aimAt.z - holder.pos.z;
  if (Math.hypot(dx, dz) < EPSILON) {
    return null;
  }
  const halfAngle =
    (Math.min(180, AIM_CONE_HALF_ANGLE_DEG * settings.aimSensitivity) * Math.PI) / 180;

  interface Candidate {
    id: number;
    angle: number;
    dist: number;
    order: number;
  }
  const candidates: Candidate[] = [];
  for (const t of teammates) {
    const vx = t.pos.x - holder.pos.x;
    const vz = t.pos.z - holder.pos.z;
    const dist = Math.hypot(vx, vz);
    if (dist < EPSILON) {
      continue;
    }
    candidates.push({
      id: t.id,
      angle: Math.abs(Math.atan2(dx * vz - dz * vx, dx * vx + dz * vz)),
      dist,
      order: ROLE_ORDER.indexOf(t.role),
    });
  }
  const better = (a: Candidate, b: Candidate): boolean => {
    if (Math.abs(a.angle - b.angle) >= TIE_EPSILON) {
      return a.angle < b.angle;
    }
    if (a.dist !== b.dist) {
      return a.dist < b.dist;
    }
    return a.order < b.order;
  };
  const pick = (pool: readonly Candidate[]): Candidate | null => {
    let best: Candidate | null = null;
    for (const c of pool) {
      if (best === null || better(c, best)) {
        best = c;
      }
    }
    return best;
  };
  const inCone = candidates.filter((c) => c.angle <= halfAngle);
  // Empty cone: fall back to the closest angle overall (decision, 2026-11-13).
  return (pick(inCone) ?? pick(candidates))?.id ?? null;
}

export interface PassTargetBadge {
  playerId: number;
  key: PassTargetKey;
  role: RoleId;
  label: string;
}

/** One badge per keyed teammate, only while the controlled player holds the ball. */
export function passTargetBadges(state: GameState): PassTargetBadge[] {
  const holder = controlledHolder(state);
  if (holder === null) {
    return [];
  }
  const teammates = teammatesOf(state, holder);
  const badges: PassTargetBadge[] = [];
  for (const key of PASS_TARGET_KEYS) {
    const role = PASS_TARGET_KEY_ROLES[key];
    const mate = teammates.find((t) => t.role === role);
    if (mate !== undefined) {
      badges.push({ playerId: mate.id, key, role, label: passTargetBadgeLabel(key) });
    }
  }
  return badges;
}
