// The single tuning file for archetype attributes and the global movement tuning. All archetype
// tuning values live here.
// Movement tuning (MOVEMENT_TUNING_DATA): sprintSpeedMultiplier and brakingMultiplier are unitless
// multipliers, sprintDurationS and staminaRefillS are in seconds.
// Units: speedMps in m/s, accelerationMps2 in m/s^2, reachM is standing reach in meters.
// strength, shooting.{rim,midRange,three}, passing, ballSecurity and defensiveAwareness are
// integer ratings 0-100, higher is better.

export const ARCHETYPES_FILE = 'src/content/data/archetypes.ts';

export const ARCHETYPES_DATA = {
  floorGeneral: {
    name: 'Floor General',
    speedMps: 6.5,
    accelerationMps2: 9.0,
    reachM: 2.45,
    strength: 40,
    shooting: { rim: 60, midRange: 65, three: 70 },
    passing: 90,
    ballSecurity: 85,
    defensiveAwareness: 70,
  },
  sharpshooter: {
    name: 'Sharpshooter',
    speedMps: 6.3,
    accelerationMps2: 8.5,
    reachM: 2.55,
    strength: 50,
    shooting: { rim: 60, midRange: 70, three: 80 },
    passing: 70,
    ballSecurity: 75,
    defensiveAwareness: 70,
  },
  twoWayWing: {
    name: 'Two-Way Wing',
    speedMps: 6.0,
    accelerationMps2: 8.0,
    reachM: 2.65,
    strength: 60,
    shooting: { rim: 70, midRange: 65, three: 65 },
    passing: 65,
    ballSecurity: 70,
    defensiveAwareness: 75,
  },
  stretchForward: {
    name: 'Stretch Forward',
    speedMps: 5.6,
    accelerationMps2: 7.0,
    reachM: 2.75,
    strength: 75,
    shooting: { rim: 75, midRange: 60, three: 50 },
    passing: 55,
    ballSecurity: 60,
    defensiveAwareness: 75,
  },
  rimProtector: {
    name: 'Rim Protector',
    speedMps: 5.2,
    accelerationMps2: 6.0,
    reachM: 2.85,
    strength: 90,
    shooting: { rim: 85, midRange: 40, three: 20 },
    passing: 50,
    ballSecurity: 50,
    defensiveAwareness: 80,
  },
};

// Global movement tuning shared by every player.
export const MOVEMENT_TUNING_DATA = {
  // Sprint top speed = speedMps * this. Unitless multiplier, >= 1.
  sprintSpeedMultiplier: 1.25,
  // Braking rate = accelerationMps2 * this. Unitless multiplier, >= 1 (stopping is quicker than starting).
  brakingMultiplier: 1.5,
  // Seconds of continuous sprint from full to empty stamina.
  sprintDurationS: 4,
  // Seconds to refill stamina from empty to full when not sprinting.
  staminaRefillS: 5,
};
