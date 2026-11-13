// Test fixture, not tuning. Real values live in src/content/data/archetypes.ts.
// Import only from sim tests; not exported from the sim barrel.

import type { MovementSetup } from './state';

export const TEST_MOVEMENT: MovementSetup = {
  profiles: {
    PG: { speedMps: 6.5, accelerationMps2: 9.0 },
    SG: { speedMps: 6.3, accelerationMps2: 8.5 },
    SF: { speedMps: 6.0, accelerationMps2: 8.0 },
    PF: { speedMps: 5.6, accelerationMps2: 7.0 },
    C: { speedMps: 5.2, accelerationMps2: 6.0 },
  },
  tuning: {
    sprintSpeedMultiplier: 1.25,
    brakingMultiplier: 1.5,
    sprintDurationS: 4,
    staminaRefillS: 5,
  },
};
