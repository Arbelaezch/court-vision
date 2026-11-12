// Visual body proportions per body type; roles pick a body type in data/roles.ts. Render reads
// these via the content barrel.

export const BODY_TYPES_FILE = 'src/content/data/bodyTypes.ts';

export const BODY_TYPES_DATA = {
  guard: { heightM: 1.75, shoulderWidthM: 0.5, limbRadiusM: 0.065, headRadiusM: 0.17, leanDeg: 10 },
  wing: { heightM: 1.95, shoulderWidthM: 0.58, limbRadiusM: 0.078, headRadiusM: 0.175, leanDeg: 6 },
  big: { heightM: 2.15, shoulderWidthM: 0.7, limbRadiusM: 0.095, headRadiusM: 0.18, leanDeg: 2 },
};
