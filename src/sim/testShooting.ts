// Test fixture, not tuning. Real values live in src/content/data/archetypes.ts.
// Import only from sim tests; not exported from the sim barrel.
// Every role has equal ratings, so the rating term of a block score is 0.

import type { ShootingSetup, ShotProfile, ShotTuning } from './state';

const PROFILE: ShotProfile = {
  shooting: { rim: 70, midRange: 70, three: 70 },
  defensiveAwareness: 70,
  reachM: 2.6,
};

export const TEST_SHOT_TUNING: ShotTuning = {
  rimZoneRadiusM: 1.5,
  floaterMaxDistanceM: 4.5,
  maxRangeM: 8.5,
  rangeRatingFloor: 40,
  layupReleaseHeightM: 2.8,
  jumpShotReleaseHeightM: 2.6,
  floaterReleaseHeightM: 3.6,
  contestRadiusM: 2.0,
  contestWeight: 0.6,
  closingLeadS: 0.3,
  beatenDefenderFactor: 0.5,
  rimContestRadiusM: 1.5,
  rimContestWeight: 0.4,
  rimContestSpanM: 1.0,
  contestJumpM: 0.3,
  offBalanceSpeedMps: 2.5,
  offBalancePenalty: 0.3,
  outOfRangePenalty: 0.6,
  floaterPenalty: 0.1,
  greatMinScore: 0.8,
  goodMinScore: 0.5,
  dribbleSpeedMps: 0.5,
  catchAndShootWindowTicks: 30,
  greatMakeChance: 0.65,
  goodMakeChance: 0.45,
  badMakeChance: 0.15,
  zoneRatingWeight: 0.4,
  minMakeChance: 0.02,
  maxMakeChance: 0.98,
  blockRadiusM: 1.0,
  blockThreshold: 0.5,
  blockRatingWeight: 0.2,
  blockJitter: 0.1,
};

export const TEST_SHOOTING: ShootingSetup = {
  profiles: {
    PG: structuredClone(PROFILE),
    SG: structuredClone(PROFILE),
    SF: structuredClone(PROFILE),
    PF: structuredClone(PROFILE),
    C: structuredClone(PROFILE),
  },
  tuning: TEST_SHOT_TUNING,
};
