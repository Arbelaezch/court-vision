// Body collision tuning (per-body-type radius and mass, plus the global "set" and solver numbers)
// types and loader. The values themselves live in data/archetypes.ts.

import { ARCHETYPES_FILE, COLLISION_TUNING_DATA } from './data/archetypes';
import { BODY_TYPES, type BodyType } from './roles';
import {
  getField,
  readNumber,
  readObject,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
  type FieldPath,
} from './validate';

export interface BodyCollisionSpec {
  /** Body radius on the court plane, in m. */
  readonly radiusM: number;
  /** Unitless relative push resistance. */
  readonly mass: number;
}

export interface CollisionTuningSpec {
  readonly bodies: Readonly<Record<BodyType, BodyCollisionSpec>>;
  /** m/s, a player at or below this speed (and not pressing to move) counts as set. */
  readonly setSpeedMps: number;
  /** Unitless, a set player's mass is multiplied by this. */
  readonly setMassMultiplier: number;
  /** Push-apart passes over every pair per step. */
  readonly iterations: number;
}

export const BUNDLED_COLLISION_TUNING_SOURCE: ContentSource = {
  file: ARCHETYPES_FILE,
  data: COLLISION_TUNING_DATA,
};

const COLLISION_KEYS = ['bodies', 'setSpeedMps', 'setMassMultiplier', 'iterations'] as const;
const BODY_KEYS = ['radiusM', 'mass'] as const;

type NumberOpts = { min?: number; max?: number; integer?: boolean };

function readNumberField(
  obj: Record<string, unknown>,
  key: string,
  at: FieldPath,
  opts: NumberOpts,
) {
  const f = getField(obj, key, at);
  return readNumber(f.value, f.at, opts);
}

export function loadCollisionTuning(
  source: ContentSource = BUNDLED_COLLISION_TUNING_SOURCE,
): CollisionTuningSpec {
  const at = rootPath(source.file, 'collision');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, COLLISION_KEYS, at);

  const bodiesField = getField(obj, 'bodies', at);
  const bodiesObj = readObject(bodiesField.value, bodiesField.at);
  rejectUnknownKeys(bodiesObj, BODY_TYPES, bodiesField.at);
  const bodies: Partial<Record<BodyType, BodyCollisionSpec>> = {};
  for (const bodyType of BODY_TYPES) {
    const bodyField = getField(bodiesObj, bodyType, bodiesField.at);
    const body = readObject(bodyField.value, bodyField.at);
    rejectUnknownKeys(body, BODY_KEYS, bodyField.at);
    bodies[bodyType] = {
      radiusM: readNumberField(body, 'radiusM', bodyField.at, { min: 0.15, max: 0.3 }),
      mass: readNumberField(body, 'mass', bodyField.at, { min: 0.5, max: 5 }),
    };
  }

  return {
    bodies: bodies as Record<BodyType, BodyCollisionSpec>,
    setSpeedMps: readNumberField(obj, 'setSpeedMps', at, { min: 0, max: 2 }),
    setMassMultiplier: readNumberField(obj, 'setMassMultiplier', at, { min: 1, max: 50 }),
    iterations: readNumberField(obj, 'iterations', at, { min: 1, max: 16, integer: true }),
  };
}
