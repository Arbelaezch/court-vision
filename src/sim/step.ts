// One fixed simulation step. stepGame is pure: it clones the state and never mutates its inputs,
// so the renderer can keep the previous and current states and interpolate between them.

import type { CourtPoint, GameState, SimAction } from './state';
import { FIXED_DT } from './stepper';

// Placeholder kinematic move speed (m/s) so inputs visibly change state. The movement issue
// (sim-movement-stamina) replaces this with acceleration, sprint and stamina.
export const PLACEHOLDER_MOVE_SPEED_MPS = 4;

function clampToUnitLength(x: number, z: number): CourtPoint {
  const len = Math.hypot(x, z);
  if (len > 1) {
    return { x: x / len, z: z / len };
  }
  return { x, z };
}

function applyAction(next: GameState, action: SimAction): void {
  switch (action.type) {
    case 'move': {
      if (!Number.isFinite(action.x) || !Number.isFinite(action.z)) {
        throw new Error('Court Vision: move action needs finite x and z');
      }
      const player = next.players.find((p) => p.id === next.controlledPlayerId);
      if (player === undefined) {
        throw new Error(
          `Court Vision: controlled player ${next.controlledPlayerId} not found in game state`,
        );
      }
      player.moveIntent = clampToUnitLength(action.x, action.z);
      return;
    }
    default: {
      const unhandled: never = action.type;
      throw new Error(`Court Vision: unknown sim action ${String(unhandled)}`);
    }
  }
}

export function stepGame(state: GameState, actions: readonly SimAction[]): GameState {
  const next = structuredClone(state);

  for (const action of actions) {
    applyAction(next, action);
  }

  // Placeholder motion: velocity follows intent instantly. Replaced by the movement issue.
  for (const player of next.players) {
    player.vel = {
      x: player.moveIntent.x * PLACEHOLDER_MOVE_SPEED_MPS,
      z: player.moveIntent.z * PLACEHOLDER_MOVE_SPEED_MPS,
    };
    player.pos = {
      x: player.pos.x + player.vel.x * FIXED_DT,
      z: player.pos.z + player.vel.z * FIXED_DT,
    };
  }

  // Ball flight belongs to the passing issue; shot-clock violations are not simulated yet.
  if (next.shotClockTicks !== null && next.shotClockTicks > 0) {
    next.shotClockTicks -= 1;
  }

  next.tick += 1;
  return next;
}
