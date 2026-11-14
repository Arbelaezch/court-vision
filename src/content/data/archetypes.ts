// The single tuning file for archetype attributes and the global movement and pass tuning. All
// archetype tuning values live here.
// Pass tuning (PASS_TUNING_DATA): heights and radii in m, speeds in m/s, the rest unitless.
// Shot tuning (SHOT_TUNING_DATA): distances and heights in m, speeds in m/s, closingLeadS in s,
// catchAndShootWindowTicks in ticks, rangeRatingFloor a 0-100 rating, the rest unitless.
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

// Pass tuning shared by every player. Heights and radii are in m, speeds in m/s, the rest unitless.
export const PASS_TUNING_DATA = {
  chestPass: {
    speedMps: 12, // m/s
    releaseHeightM: 1.3, // m
    catchHeightM: 1.3, // m
    catchRadiusM: 0.5, // m
  },
  bouncePass: {
    speedMps: 9, // m/s
    releaseHeightM: 0.9, // m
    catchHeightM: 0.9, // m
    catchRadiusM: 0.5, // m
    bounceAtFraction: 0.65, // fraction of the path (0-1) where the ball hits the floor
  },
  lob: {
    speedMps: 7, // m/s
    releaseHeightM: 2.1, // m
    catchHeightM: 2.3, // m
    catchRadiusM: 1.5, // m
    apexHeightM: 4.2, // m, ball height at mid-flight
  },
  handOff: {
    speedMps: 4, // m/s
    releaseHeightM: 1.1, // m
    catchHeightM: 1.1, // m
    catchRadiusM: 0.3, // m
    maxDistanceM: 1.5, // m, farthest a hand-off can be made
  },
  laneRadiusM: 0.9, // m, how near a defender must be to the passing lane to threaten it
  contestLowM: 0.7, // m, lowest ball height a defender can touch
  contestJumpM: 0.3, // m, extra height a defender gains by jumping, above their reach
  interceptThreshold: 0.5, // unitless score (0-1) at which a threat intercepts
  ratingWeight: 0.2, // unitless, how much the 0-100 rating gap moves the score
  jitter: 0.1, // unitless, bound of the seeded random term added to a score
  setSpeedMps: 0.5, // m/s, a receiver at or below this speed counts as set
};

// Shot tuning shared by every player. Distances and heights are in m, speeds in m/s, times in s,
// catchAndShootWindowTicks in sim ticks, rangeRatingFloor is a 0-100 rating, the rest unitless.
export const SHOT_TUNING_DATA = {
  rimZoneRadiusM: 1.5, // m, within this of the rim a shot is a layup in the rim zone
  floaterMaxDistanceM: 4.5, // m, farthest from the rim a floater can be taken
  maxRangeM: 8.5, // m, beyond this distance from the rim a shot is out of range
  rangeRatingFloor: 40, // rating (0-100), a zone rating below this is out of range
  layupReleaseHeightM: 2.8, // m, ball height at release of a layup
  jumpShotReleaseHeightM: 2.6, // m, ball height at release of a jump shot
  floaterReleaseHeightM: 3.6, // m, ball height at release of a floater
  contestRadiusM: 2.0, // m, a defender nearer than this contests the shot
  contestWeight: 0.6, // unitless, look penalty of a defender at point-blank range
  closingLeadS: 0.3, // s, how far ahead a closing defender's approach is counted
  beatenDefenderFactor: 0.5, // unitless, contest multiplier when the defender is beaten
  rimContestRadiusM: 1.5, // m, how near a defender must be to contest at the rim
  rimContestWeight: 0.4, // unitless, largest look penalty from a rim contest
  rimContestSpanM: 1.0, // m, reach gap over which a rim contest goes from none to full
  contestJumpM: 0.3, // m, extra height a defender gains by jumping, above their reach
  offBalanceSpeedMps: 2.5, // m/s, shooter faster than this is off balance
  offBalancePenalty: 0.3, // unitless, look penalty for an off-balance jump shot
  outOfRangePenalty: 0.6, // unitless, look penalty for an out-of-range shot
  floaterPenalty: 0.1, // unitless, fixed look penalty for taking a floater
  crowdingRadiusM: 2.0, // m, a teammate nearer than this to the shooter crowds the shot
  driveLaneHalfWidthM: 1.0, // m, half-width of the shooter's lane to the rim; a teammate inside it is in the way
  spacingWeight: 0.25, // unitless, largest look penalty from a crowding or in-lane teammate
  greatMinScore: 0.8, // unitless score (0-1) at or above which a look is Great
  goodMinScore: 0.5, // unitless score (0-1) at or above which a look is Good
  dribbleSpeedMps: 0.5, // m/s, a ball holder faster than this is dribbling
  catchAndShootWindowTicks: 30, // ticks, how long after a set catch a shot is catch-and-shoot
  greatMakeChance: 0.65, // probability (0-1) of making a Great look at a 50 rating
  goodMakeChance: 0.45, // probability (0-1) of making a Good look at a 50 rating
  badMakeChance: 0.15, // probability (0-1) of making a Bad look at a 50 rating
  zoneRatingWeight: 0.4, // unitless, how much the 0-100 zone rating moves the make chance
  minMakeChance: 0.02, // probability (0-1), lowest make chance
  maxMakeChance: 0.98, // probability (0-1), highest make chance
  blockRadiusM: 1.0, // m, a defender must be within this to block
  blockThreshold: 0.5, // unitless score (0-1) at which a defender blocks
  blockRatingWeight: 0.2, // unitless, how much the 0-100 rating gap moves the block score
  blockJitter: 0.1, // unitless, bound of the seeded random term added to a block score
};
