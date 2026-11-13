// Kinematic player movement for one fixed step: acceleration toward the intended velocity
// ("2K-lite" weight), sprint with stamina, and pivot (hold in place, protect state).
// Numbers come from PlayerState.movement and GameState.movementTuning, filled in by the content
// layer; the sim never reads content.

import type { CourtPoint, MovementTuning, PlayerState } from './state';
import { FIXED_DT } from './stepper';

// Moves `from` toward `to` by at most `maxStep`, landing exactly on `to` when within one step.
function moveToward(from: CourtPoint, to: CourtPoint, maxStep: number): CourtPoint {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxStep) {
    return { x: to.x, z: to.z };
  }
  const scale = maxStep / dist;
  return { x: from.x + dx * scale, z: from.z + dz * scale };
}

function refillStamina(player: PlayerState, tuning: MovementTuning): void {
  player.stamina = Math.min(1, player.stamina + FIXED_DT / tuning.staminaRefillS);
}

/** Advances one player by one fixed step. Mutates `player`, which must already be a clone. */
export function stepPlayerMovement(player: PlayerState, tuning: MovementTuning): void {
  const intentLen = Math.hypot(player.moveIntent.x, player.moveIntent.z);

  if (player.pivotHeld) {
    // Pivot: plant in place and protect. Intent is kept so movement resumes from rest on release.
    player.protecting = true;
    player.sprinting = false;
    player.vel = { x: 0, z: 0 };
    refillStamina(player, tuning);
    return;
  }
  player.protecting = false;

  // Effective sprint uses the stamina at the start of the tick.
  player.sprinting = player.sprintHeld && intentLen > 0 && player.stamina > 0;
  const { speedMps, accelerationMps2 } = player.movement;
  const topSpeed = speedMps * (player.sprinting ? tuning.sprintSpeedMultiplier : 1);
  const target = { x: player.moveIntent.x * topSpeed, z: player.moveIntent.z * topSpeed };

  // Speeding up along the current heading uses acceleration; any change that removes current
  // velocity (slowing, cutting, reversing) brakes harder (forgiving).
  const speedingUp =
    player.vel.x * target.x + player.vel.z * target.z >=
    player.vel.x * player.vel.x + player.vel.z * player.vel.z;
  const rate = speedingUp ? accelerationMps2 : accelerationMps2 * tuning.brakingMultiplier;
  player.vel = moveToward(player.vel, target, rate * FIXED_DT);

  // Semi-implicit Euler: new velocity, then position.
  player.pos = {
    x: player.pos.x + player.vel.x * FIXED_DT,
    z: player.pos.z + player.vel.z * FIXED_DT,
  };

  if (player.sprinting) {
    player.stamina = Math.max(0, player.stamina - FIXED_DT / tuning.sprintDurationS);
  } else if (!(player.sprintHeld && intentLen > 0)) {
    // Holding sprint at zero stamina while moving keeps it empty (no flicker); release refills.
    refillStamina(player, tuning);
  }
}
