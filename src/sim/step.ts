// One fixed simulation step. stepGame is pure: it clones the state and never mutates its inputs,
// so the renderer can keep the previous and current states and interpolate between them.
// Actions set the controlled player's inputs (move intent, held sprint and pivot); every player
// then moves kinematically with acceleration, sprint and stamina (./movement.ts).

import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X } from './court';
import { stepPlayerMovement } from './movement';
import type { CourtPoint, GameState, PlayerState, SimAction } from './state';

function clampToUnitLength(x: number, z: number): CourtPoint {
  const len = Math.hypot(x, z);
  if (len > 1) {
    return { x: x / len, z: z / len };
  }
  return { x, z };
}

function isPastSideOrBaseline(p: CourtPoint): boolean {
  return Math.abs(p.x) > SIDELINE_X || p.z < BASELINE_Z;
}

// Everyone is stopped by the half-court line; only players without the ball are also stopped by
// the sideline and baseline (the ball holder may carry the ball out, which is a turnover).
function applyBounds(player: PlayerState, isHolder: boolean): void {
  if (player.pos.z > HALF_COURT_LINE_Z) {
    player.pos.z = HALF_COURT_LINE_Z;
    player.vel.z = 0;
  }
  if (isHolder) {
    return;
  }
  if (player.pos.x > SIDELINE_X) {
    player.pos.x = SIDELINE_X;
    player.vel.x = 0;
  } else if (player.pos.x < -SIDELINE_X) {
    player.pos.x = -SIDELINE_X;
    player.vel.x = 0;
  }
  if (player.pos.z < BASELINE_Z) {
    player.pos.z = BASELINE_Z;
    player.vel.z = 0;
  }
}

function controlledPlayer(next: GameState): PlayerState {
  const player = next.players.find((p) => p.id === next.controlledPlayerId);
  if (player === undefined) {
    throw new Error(
      `Court Vision: controlled player ${next.controlledPlayerId} not found in game state`,
    );
  }
  return player;
}

function applyAction(next: GameState, action: SimAction): void {
  switch (action.type) {
    case 'move': {
      if (!Number.isFinite(action.x) || !Number.isFinite(action.z)) {
        throw new Error('Court Vision: move action needs finite x and z');
      }
      controlledPlayer(next).moveIntent = clampToUnitLength(action.x, action.z);
      return;
    }
    case 'sprint': {
      if (typeof action.held !== 'boolean') {
        throw new Error('Court Vision: sprint action needs a boolean held');
      }
      controlledPlayer(next).sprintHeld = action.held;
      return;
    }
    case 'pivot': {
      if (typeof action.held !== 'boolean') {
        throw new Error('Court Vision: pivot action needs a boolean held');
      }
      controlledPlayer(next).pivotHeld = action.held;
      return;
    }
    default: {
      const unhandled: never = action;
      throw new Error(
        `Court Vision: unknown sim action ${String((unhandled as { type: unknown }).type)}`,
      );
    }
  }
}

export function stepGame(state: GameState, actions: readonly SimAction[]): GameState {
  const next = structuredClone(state);

  for (const action of actions) {
    applyAction(next, action);
  }

  next.events = [];
  const holderId = next.ball.kind === 'held' ? next.ball.holderId : null;
  const holderBefore = holderId === null ? undefined : state.players.find((p) => p.id === holderId);
  const holderWasPastLine = holderBefore !== undefined && isPastSideOrBaseline(holderBefore.pos);

  for (const player of next.players) {
    stepPlayerMovement(player, next.movementTuning);
    applyBounds(player, player.id === holderId);
  }

  const holderAfter = holderId === null ? undefined : next.players.find((p) => p.id === holderId);
  if (holderAfter !== undefined && !holderWasPastLine && isPastSideOrBaseline(holderAfter.pos)) {
    next.events.push({
      type: 'mistake',
      tick: state.tick + 1,
      kind: 'turnover',
      reason: 'Out of bounds',
    });
  }

  // Ball flight belongs to the passing issue; shot-clock violations are not simulated yet.
  if (next.shotClockTicks !== null && next.shotClockTicks > 0) {
    next.shotClockTicks -= 1;
  }

  next.tick += 1;
  return next;
}
