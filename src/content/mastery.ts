// Mastery tuning (successful runs needed to master a play in a mode) types and loader. The value
// itself lives in data/mastery.ts.

import { MASTERY_FILE, MASTERY_TUNING_DATA } from './data/mastery';
import {
  getField,
  readNumber,
  readObject,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export interface MasteryTuningSpec {
  readonly masteredSuccesses: number;
}

export const BUNDLED_MASTERY_TUNING_SOURCE: ContentSource = {
  file: MASTERY_FILE,
  data: MASTERY_TUNING_DATA,
};

const MASTERY_KEYS = ['masteredSuccesses'] as const;

export function loadMasteryTuning(
  source: ContentSource = BUNDLED_MASTERY_TUNING_SOURCE,
): MasteryTuningSpec {
  const at = rootPath(source.file, 'mastery');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, MASTERY_KEYS, at);
  const f = getField(obj, 'masteredSuccesses', at);
  return {
    masteredSuccesses: readNumber(f.value, f.at, { min: 1, max: 1000, integer: true }),
  };
}
