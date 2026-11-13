// Builds the sim's plain-data movement setup from content: each role's default archetype gives its
// run speed and acceleration, and the global movement tuning is copied as is. Content may import
// the sim; the sim never imports content.

import { ROLE_ORDER } from '../sim';
import type { MovementProfile, MovementSetup, RoleId } from '../sim';
import { loadCastContent, type CastContent } from './cast';
import { loadMovementTuning, type MovementTuningSpec } from './movement';

export function simMovementSetup(cast: CastContent, tuning: MovementTuningSpec): MovementSetup {
  const profiles: Partial<Record<RoleId, MovementProfile>> = {};
  for (const role of ROLE_ORDER) {
    const archetypeId = cast.roles[role].defaultArchetype;
    const archetype = Object.hasOwn(cast.archetypes, archetypeId)
      ? cast.archetypes[archetypeId]
      : undefined;
    if (archetype === undefined) {
      throw new Error(`Court Vision: role ${role} uses unknown archetype "${archetypeId}"`);
    }
    profiles[role] = {
      speedMps: archetype.speedMps,
      accelerationMps2: archetype.accelerationMps2,
    };
  }
  return {
    profiles: profiles as Record<RoleId, MovementProfile>,
    tuning: {
      sprintSpeedMultiplier: tuning.sprintSpeedMultiplier,
      brakingMultiplier: tuning.brakingMultiplier,
      sprintDurationS: tuning.sprintDurationS,
      staminaRefillS: tuning.staminaRefillS,
    },
  };
}

/** Movement setup from the bundled cast and the bundled movement tuning. */
export function loadSimMovement(): MovementSetup {
  return simMovementSetup(loadCastContent(), loadMovementTuning());
}
