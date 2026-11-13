// Builds the sim's plain-data shooting setup from content: each role's default archetype gives its
// shooting numbers, and the global shot tuning is deep-copied. Content may import the sim; the sim
// never imports content.

import { ROLE_ORDER } from '../sim';
import type { RoleId, ShootingSetup, ShotProfile } from '../sim';
import { loadCastContent, type CastContent } from './cast';
import { loadShotTuning, type ShotTuningSpec } from './shooting';

export function simShootingSetup(cast: CastContent, tuning: ShotTuningSpec): ShootingSetup {
  const profiles: Partial<Record<RoleId, ShotProfile>> = {};
  for (const role of ROLE_ORDER) {
    const archetypeId = cast.roles[role].defaultArchetype;
    const archetype = Object.hasOwn(cast.archetypes, archetypeId)
      ? cast.archetypes[archetypeId]
      : undefined;
    if (archetype === undefined) {
      throw new Error(`Court Vision: role ${role} uses unknown archetype "${archetypeId}"`);
    }
    profiles[role] = {
      shooting: {
        rim: archetype.shooting.rim,
        midRange: archetype.shooting.midRange,
        three: archetype.shooting.three,
      },
      defensiveAwareness: archetype.defensiveAwareness,
      reachM: archetype.reachM,
    };
  }
  return {
    profiles: profiles as Record<RoleId, ShotProfile>,
    tuning: structuredClone(tuning) as ShootingSetup['tuning'],
  };
}

/** Shooting setup from the bundled cast and the bundled shot tuning. */
export function loadSimShooting(): ShootingSetup {
  return simShootingSetup(loadCastContent(), loadShotTuning());
}
