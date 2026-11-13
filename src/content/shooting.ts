// Global shot tuning (ranges, look penalties, make chances, block numbers) types and loader. The
// values themselves live in data/archetypes.ts.

import { ARCHETYPES_FILE, SHOT_TUNING_DATA } from './data/archetypes';
import {
  childPath,
  fail,
  getField,
  readNumber,
  readObject,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export interface ShotTuningSpec {
  readonly rimZoneRadiusM: number;
  readonly floaterMaxDistanceM: number;
  readonly maxRangeM: number;
  readonly rangeRatingFloor: number;
  readonly layupReleaseHeightM: number;
  readonly jumpShotReleaseHeightM: number;
  readonly floaterReleaseHeightM: number;
  readonly contestRadiusM: number;
  readonly contestWeight: number;
  readonly closingLeadS: number;
  readonly beatenDefenderFactor: number;
  readonly rimContestRadiusM: number;
  readonly rimContestWeight: number;
  readonly rimContestSpanM: number;
  readonly contestJumpM: number;
  readonly offBalanceSpeedMps: number;
  readonly offBalancePenalty: number;
  readonly outOfRangePenalty: number;
  readonly floaterPenalty: number;
  readonly greatMinScore: number;
  readonly goodMinScore: number;
  readonly dribbleSpeedMps: number;
  readonly catchAndShootWindowTicks: number;
  readonly greatMakeChance: number;
  readonly goodMakeChance: number;
  readonly badMakeChance: number;
  readonly zoneRatingWeight: number;
  readonly minMakeChance: number;
  readonly maxMakeChance: number;
  readonly blockRadiusM: number;
  readonly blockThreshold: number;
  readonly blockRatingWeight: number;
  readonly blockJitter: number;
}

export const BUNDLED_SHOT_TUNING_SOURCE: ContentSource = {
  file: ARCHETYPES_FILE,
  data: SHOT_TUNING_DATA,
};

type Range = { min: number; max: number; integer?: boolean };

const DISTANCE: Range = { min: 0.1, max: 12 };
const HEIGHT: Range = { min: 1, max: 5 };
const UNIT: Range = { min: 0, max: 1 };
const SCORE: Range = { min: 0.05, max: 1 };
const SPEED: Range = { min: 0, max: 10 };

const RANGES: Record<keyof ShotTuningSpec, Range> = {
  rimZoneRadiusM: DISTANCE,
  floaterMaxDistanceM: DISTANCE,
  maxRangeM: DISTANCE,
  rangeRatingFloor: { min: 0, max: 100 },
  layupReleaseHeightM: HEIGHT,
  jumpShotReleaseHeightM: HEIGHT,
  floaterReleaseHeightM: HEIGHT,
  contestRadiusM: DISTANCE,
  contestWeight: UNIT,
  closingLeadS: { min: 0, max: 2 },
  beatenDefenderFactor: UNIT,
  rimContestRadiusM: DISTANCE,
  rimContestWeight: UNIT,
  rimContestSpanM: DISTANCE,
  contestJumpM: DISTANCE,
  offBalanceSpeedMps: SPEED,
  offBalancePenalty: UNIT,
  outOfRangePenalty: UNIT,
  floaterPenalty: UNIT,
  greatMinScore: SCORE,
  goodMinScore: SCORE,
  dribbleSpeedMps: SPEED,
  catchAndShootWindowTicks: { min: 0, max: 600, integer: true },
  greatMakeChance: UNIT,
  goodMakeChance: UNIT,
  badMakeChance: UNIT,
  zoneRatingWeight: UNIT,
  minMakeChance: UNIT,
  maxMakeChance: UNIT,
  blockRadiusM: DISTANCE,
  blockThreshold: SCORE,
  blockRatingWeight: UNIT,
  blockJitter: { min: 0, max: 0.3 },
};

const KEYS = Object.keys(RANGES) as (keyof ShotTuningSpec)[];

export function loadShotTuning(source: ContentSource = BUNDLED_SHOT_TUNING_SOURCE): ShotTuningSpec {
  const at = rootPath(source.file, 'shooting');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, KEYS, at);

  const out: Partial<Record<keyof ShotTuningSpec, number>> = {};
  for (const key of KEYS) {
    const f = getField(obj, key, at);
    out[key] = readNumber(f.value, f.at, RANGES[key]);
  }
  const t = out as ShotTuningSpec;

  if (t.greatMinScore <= t.goodMinScore) {
    fail(
      childPath(at, 'greatMinScore'),
      `must be above goodMinScore (${t.goodMinScore}), got ${t.greatMinScore}`,
    );
  }
  if (t.goodMakeChance < t.badMakeChance) {
    fail(
      childPath(at, 'goodMakeChance'),
      `must be at least badMakeChance (${t.badMakeChance}), got ${t.goodMakeChance}`,
    );
  }
  if (t.greatMakeChance < t.goodMakeChance) {
    fail(
      childPath(at, 'greatMakeChance'),
      `must be at least goodMakeChance (${t.goodMakeChance}), got ${t.greatMakeChance}`,
    );
  }
  if (t.minMakeChance > t.maxMakeChance) {
    fail(
      childPath(at, 'minMakeChance'),
      `must not exceed maxMakeChance (${t.maxMakeChance}), got ${t.minMakeChance}`,
    );
  }
  return t;
}
