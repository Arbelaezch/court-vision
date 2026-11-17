// Builds the sim's plain-data movement setup from content: each role's default archetype gives its
// run speed and acceleration, the global movement tuning is copied as is, and each role's body type
// gives its collision radius and mass (plus the global collision tuning). Content may import the
// sim; the sim never imports content.

import { ROLE_ORDER } from '../sim';
import type { BodyProfile, MovementProfile, MovementSetup, RoleId } from '../sim';
import { loadCastContent, type CastContent } from './cast';
import { loadCollisionTuning, type CollisionTuningSpec } from './collision';
import { loadMovementTuning, type MovementTuningSpec } from './movement';

export function simMovementSetup(
  cast: CastContent,
  tuning: MovementTuningSpec,
  collision: CollisionTuningSpec = loadCollisionTuning(),
): MovementSetup {
  const profiles: Partial<Record<RoleId, MovementProfile>> = {};
  const bodies: Partial<Record<RoleId, BodyProfile>> = {};
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
    const body = collision.bodies[cast.roles[role].bodyType];
    bodies[role] = { radiusM: body.radiusM, mass: body.mass };
  }
  return {
    profiles: profiles as Record<RoleId, MovementProfile>,
    tuning: {
      sprintSpeedMultiplier: tuning.sprintSpeedMultiplier,
      brakingMultiplier: tuning.brakingMultiplier,
      sprintDurationS: tuning.sprintDurationS,
      staminaRefillS: tuning.staminaRefillS,
    },
    collision: {
      profiles: bodies as Record<RoleId, BodyProfile>,
      tuning: {
        setSpeedMps: collision.setSpeedMps,
        setMassMultiplier: collision.setMassMultiplier,
        iterations: collision.iterations,
      },
    },
  };
}

/** Movement setup from the bundled cast, movement tuning and collision tuning. */
export function loadSimMovement(): MovementSetup {
  return simMovementSetup(loadCastContent(), loadMovementTuning(), loadCollisionTuning());
}
