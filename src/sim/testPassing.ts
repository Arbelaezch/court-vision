// Test fixture, not tuning. Real values live in src/content/data/archetypes.ts.
// Import only from sim tests; not exported from the sim barrel.
// Every role has equal ratings, so the rating term of an interception score is 0.

import type { PassProfile, PassingSetup } from './state';

const PROFILE: PassProfile = { passing: 70, ballSecurity: 70, defensiveAwareness: 70, reachM: 2.6 };

export const TEST_PASSING: PassingSetup = {
  profiles: {
    PG: { ...PROFILE },
    SG: { ...PROFILE },
    SF: { ...PROFILE },
    PF: { ...PROFILE },
    C: { ...PROFILE },
  },
  tuning: {
    chestPass: { speedMps: 12, releaseHeightM: 1.3, catchHeightM: 1.3, catchRadiusM: 0.5 },
    bouncePass: {
      speedMps: 9,
      releaseHeightM: 0.9,
      catchHeightM: 0.9,
      catchRadiusM: 0.5,
      bounceAtFraction: 0.65,
    },
    lob: {
      speedMps: 7,
      releaseHeightM: 2.1,
      catchHeightM: 2.3,
      catchRadiusM: 1.5,
      apexHeightM: 4.2,
    },
    handOff: {
      speedMps: 4,
      releaseHeightM: 1.1,
      catchHeightM: 1.1,
      catchRadiusM: 0.3,
      maxDistanceM: 1.5,
    },
    laneRadiusM: 0.9,
    contestLowM: 0.7,
    contestJumpM: 0.3,
    interceptThreshold: 0.5,
    ratingWeight: 0.2,
    jitter: 0.1,
    setSpeedMps: 0.5,
  },
};
