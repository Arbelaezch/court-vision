// Global movement tuning (sprint, stamina, braking) types and loader. The values themselves live
// in data/archetypes.ts.

import { ARCHETYPES_FILE, MOVEMENT_TUNING_DATA } from './data/archetypes';
import {
  getField,
  readNumber,
  readObject,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export interface MovementTuningSpec {
  readonly sprintSpeedMultiplier: number;
  readonly brakingMultiplier: number;
  readonly sprintDurationS: number;
  readonly staminaRefillS: number;
}

export const BUNDLED_MOVEMENT_TUNING_SOURCE: ContentSource = {
  file: ARCHETYPES_FILE,
  data: MOVEMENT_TUNING_DATA,
};

const MOVEMENT_KEYS = [
  'sprintSpeedMultiplier',
  'brakingMultiplier',
  'sprintDurationS',
  'staminaRefillS',
] as const;

export function loadMovementTuning(
  source: ContentSource = BUNDLED_MOVEMENT_TUNING_SOURCE,
): MovementTuningSpec {
  const at = rootPath(source.file, 'movement');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, MOVEMENT_KEYS, at);

  const num = (key: string, opts: { min?: number; max?: number }) => {
    const f = getField(obj, key, at);
    return readNumber(f.value, f.at, opts);
  };

  return {
    sprintSpeedMultiplier: num('sprintSpeedMultiplier', { min: 1, max: 2 }),
    brakingMultiplier: num('brakingMultiplier', { min: 1, max: 4 }),
    sprintDurationS: num('sprintDurationS', { min: 0.5, max: 30 }),
    staminaRefillS: num('staminaRefillS', { min: 0.5, max: 60 }),
  };
}
