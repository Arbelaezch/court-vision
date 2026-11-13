// Global pass tuning (flight speeds, heights, interception numbers) types and loader. The values
// themselves live in data/archetypes.ts.

import { ARCHETYPES_FILE, PASS_TUNING_DATA } from './data/archetypes';
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

interface PassFlightSpec {
  readonly speedMps: number;
  readonly releaseHeightM: number;
  readonly catchHeightM: number;
  readonly catchRadiusM: number;
}

export interface PassTuningSpec {
  readonly chestPass: PassFlightSpec;
  readonly bouncePass: PassFlightSpec & { readonly bounceAtFraction: number };
  readonly lob: PassFlightSpec & { readonly apexHeightM: number };
  readonly handOff: PassFlightSpec & { readonly maxDistanceM: number };
  readonly laneRadiusM: number;
  readonly contestLowM: number;
  readonly contestJumpM: number;
  readonly interceptThreshold: number;
  readonly ratingWeight: number;
  readonly jitter: number;
  readonly setSpeedMps: number;
}

export const BUNDLED_PASS_TUNING_SOURCE: ContentSource = {
  file: ARCHETYPES_FILE,
  data: PASS_TUNING_DATA,
};

const FLIGHT_KEYS = ['speedMps', 'releaseHeightM', 'catchHeightM', 'catchRadiusM'] as const;
const TOP_KEYS = [
  'chestPass',
  'bouncePass',
  'lob',
  'handOff',
  'laneRadiusM',
  'contestLowM',
  'contestJumpM',
  'interceptThreshold',
  'ratingWeight',
  'jitter',
  'setSpeedMps',
] as const;

type Range = { min: number; max: number };

export function loadPassTuning(source: ContentSource = BUNDLED_PASS_TUNING_SOURCE): PassTuningSpec {
  const at = rootPath(source.file, 'passing');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, TOP_KEYS, at);

  const num = (parent: Record<string, unknown>, parentAt: typeof at, key: string, r: Range) => {
    const f = getField(parent, key, parentAt);
    return readNumber(f.value, f.at, r);
  };

  const flight = (key: string, extra: readonly string[]) => {
    const f = getField(obj, key, at);
    const o = readObject(f.value, f.at);
    rejectUnknownKeys(o, [...FLIGHT_KEYS, ...extra], f.at);
    return {
      o,
      at: f.at,
      value: {
        speedMps: num(o, f.at, 'speedMps', { min: 1, max: 30 }),
        releaseHeightM: num(o, f.at, 'releaseHeightM', { min: 0.3, max: 3.5 }),
        catchHeightM: num(o, f.at, 'catchHeightM', { min: 0.3, max: 3.5 }),
        catchRadiusM: num(o, f.at, 'catchRadiusM', { min: 0, max: 3 }),
      },
    };
  };

  const chest = flight('chestPass', []);
  const bounce = flight('bouncePass', ['bounceAtFraction']);
  const lob = flight('lob', ['apexHeightM']);
  const handOff = flight('handOff', ['maxDistanceM']);

  const apexHeightM = num(lob.o, lob.at, 'apexHeightM', { min: 2, max: 8 });
  if (apexHeightM <= lob.value.releaseHeightM || apexHeightM <= lob.value.catchHeightM) {
    fail(
      childPath(lob.at, 'apexHeightM'),
      `must be above the lob release and catch heights, got ${apexHeightM}`,
    );
  }

  return {
    chestPass: chest.value,
    bouncePass: {
      ...bounce.value,
      bounceAtFraction: num(bounce.o, bounce.at, 'bounceAtFraction', { min: 0.1, max: 0.9 }),
    },
    lob: { ...lob.value, apexHeightM },
    handOff: {
      ...handOff.value,
      maxDistanceM: num(handOff.o, handOff.at, 'maxDistanceM', { min: 0.3, max: 3 }),
    },
    laneRadiusM: num(obj, at, 'laneRadiusM', { min: 0.1, max: 3 }),
    contestLowM: num(obj, at, 'contestLowM', { min: 0, max: 2 }),
    contestJumpM: num(obj, at, 'contestJumpM', { min: 0, max: 1.5 }),
    interceptThreshold: num(obj, at, 'interceptThreshold', { min: 0.05, max: 1 }),
    ratingWeight: num(obj, at, 'ratingWeight', { min: 0, max: 1 }),
    jitter: num(obj, at, 'jitter', { min: 0, max: 0.3 }),
    setSpeedMps: num(obj, at, 'setSpeedMps', { min: 0, max: 3 }),
  };
}
