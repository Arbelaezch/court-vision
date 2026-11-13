// One fixed simulation step. stepGame is pure: it clones the state and never mutates its inputs,
// so the renderer can keep the previous and current states and interpolate between them.
// Commands act on players other than the controlled one (AI teammates, Practice cones): steer sets
// the move intent, place teleports, pass releases a pass from that player. They apply in order,
// before the actions. Actions set the controlled player's inputs (move intent, held sprint and
// pivot); every player then moves kinematically with acceleration, sprint and stamina (./movement.ts). A pass action
// releases the ball, which then flies to the receiver over later steps (./passing.ts). A shoot or
// floater action resolves the shot instantly, before movement, from the positions the step starts
// with (./takeShot.ts); its events are kept in this step's events.

import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X, isInBounds } from './court';
import { stepPlayerMovement } from './movement';
import { advanceBallFlight, startPass } from './passing';
import type { CourtPoint, GameState, PlayerCommand, PlayerState, SimAction } from './state';
import { takeShot } from './takeShot';

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

function applyAction(next: GameState, action: SimAction, eventTick: number): void {
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
    case 'pass': {
      startPass(next, action.passType, action.targetId);
      return;
    }
    case 'shoot':
    case 'floater': {
      next.events.push(...takeShot(next, action.type, eventTick));
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

/** The non-controlled player a command targets; throws on a caller bug. */
function commandedPlayer(next: GameState, command: PlayerCommand): PlayerState {
  const { playerId } = command;
  if (!Number.isInteger(playerId)) {
    throw new Error(
      `Court Vision: ${command.type} command playerId must be an integer, got ${String(playerId)}`,
    );
  }
  if (playerId === next.controlledPlayerId) {
    throw new Error(
      `Court Vision: ${command.type} command cannot target the controlled player ${playerId}`,
    );
  }
  const player = next.players.find((p) => p.id === playerId);
  if (player === undefined) {
    throw new Error(`Court Vision: ${command.type} command player ${playerId} not found`);
  }
  return player;
}

function requireFinitePoint(command: { type: string; x: number; z: number }): void {
  if (!Number.isFinite(command.x) || !Number.isFinite(command.z)) {
    throw new Error(`Court Vision: ${command.type} command needs finite x and z`);
  }
}

function applyCommand(next: GameState, command: PlayerCommand): void {
  switch (command.type) {
    case 'steer': {
      const player = commandedPlayer(next, command);
      requireFinitePoint(command);
      player.moveIntent = clampToUnitLength(command.x, command.z);
      return;
    }
    case 'place': {
      const player = commandedPlayer(next, command);
      requireFinitePoint(command);
      const spot = { x: command.x, z: command.z };
      if (!isInBounds(spot)) {
        throw new Error(
          `Court Vision: place command spot (${command.x}, ${command.z}) is out of bounds`,
        );
      }
      player.pos = spot;
      player.vel = { x: 0, z: 0 };
      player.moveIntent = { x: 0, z: 0 };
      return;
    }
    case 'pass': {
      const player = commandedPlayer(next, command);
      startPass(next, command.passType, command.targetId, player.id);
      return;
    }
    default: {
      const unhandled: never = command;
      throw new Error(
        `Court Vision: unknown player command ${String((unhandled as { type: unknown }).type)}`,
      );
    }
  }
}

export function stepGame(
  state: GameState,
  actions: readonly SimAction[],
  commands: readonly PlayerCommand[] = [],
): GameState {
  const next = structuredClone(state);
  const eventTick = state.tick + 1;

  next.events = [];
  for (const command of commands) {
    applyCommand(next, command);
  }
  for (const action of actions) {
    applyAction(next, action, eventTick);
  }

  // The post-action holder: a dead ball (after a shot) has none, so it cannot go out of bounds.
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

  // An in-flight pass advances after movement, so it tracks the receiver's new position and the
  // catch sees the receiver's velocity on this step (./passing.ts).
  next.events.push(...advanceBallFlight(next, state.tick + 1));

  // Shot-clock violations are not simulated yet.
  if (next.shotClockTicks !== null && next.shotClockTicks > 0) {
    next.shotClockTicks -= 1;
  }

  next.tick += 1;
  return next;
}
