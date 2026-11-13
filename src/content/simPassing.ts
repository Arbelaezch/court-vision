// Builds the sim's plain-data passing setup from content: each role's default archetype gives its
// passing numbers, and the global pass tuning is deep-copied. Content may import the sim; the sim
// never imports content.

import { ROLE_ORDER } from '../sim';
import type { PassProfile, PassingSetup, RoleId } from '../sim';
import { loadCastContent, type CastContent } from './cast';
import { loadPassTuning, type PassTuningSpec } from './passing';

export function simPassingSetup(cast: CastContent, tuning: PassTuningSpec): PassingSetup {
  const profiles: Partial<Record<RoleId, PassProfile>> = {};
  for (const role of ROLE_ORDER) {
    const archetypeId = cast.roles[role].defaultArchetype;
    const archetype = Object.hasOwn(cast.archetypes, archetypeId)
      ? cast.archetypes[archetypeId]
      : undefined;
    if (archetype === undefined) {
      throw new Error(`Court Vision: role ${role} uses unknown archetype "${archetypeId}"`);
    }
    profiles[role] = {
      passing: archetype.passing,
      ballSecurity: archetype.ballSecurity,
      defensiveAwareness: archetype.defensiveAwareness,
      reachM: archetype.reachM,
    };
  }
  return {
    profiles: profiles as Record<RoleId, PassProfile>,
    tuning: structuredClone(tuning) as PassingSetup['tuning'],
  };
}

/** Passing setup from the bundled cast and the bundled pass tuning. */
export function loadSimPassing(): PassingSetup {
  return simPassingSetup(loadCastContent(), loadPassTuning());
}
