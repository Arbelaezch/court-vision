// Body-type proportion types and loader. Lengths are meters; render derives all geometry from these.

import { BODY_TYPES, type BodyType } from './roles';
import {
  fail,
  getField,
  readNumber,
  readObject,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export interface BodyTypeSpec {
  readonly id: BodyType;
  readonly heightM: number;
  readonly shoulderWidthM: number;
  readonly limbRadiusM: number;
  readonly headRadiusM: number;
  readonly leanDeg: number;
}

export type BodyTypeTable = Readonly<Record<BodyType, BodyTypeSpec>>;

const BODY_TYPE_KEYS = [
  'heightM',
  'shoulderWidthM',
  'limbRadiusM',
  'headRadiusM',
  'leanDeg',
] as const;

export function loadBodyTypes(source: ContentSource): BodyTypeTable {
  const rootAt = rootPath(source.file, 'bodyTypes');
  const root = readObject(source.data, rootAt);
  rejectUnknownKeys(root, BODY_TYPES, rootAt);

  const table: Partial<Record<BodyType, BodyTypeSpec>> = {};
  for (const id of BODY_TYPES) {
    const entry = getField(root, id, rootAt);
    const at = entry.at;
    const obj = readObject(entry.value, at);
    rejectUnknownKeys(obj, BODY_TYPE_KEYS, at);

    const heightField = getField(obj, 'heightM', at);
    const heightM = readNumber(heightField.value, heightField.at, { min: 1.5, max: 2.3 });
    const shoulderField = getField(obj, 'shoulderWidthM', at);
    const shoulderWidthM = readNumber(shoulderField.value, shoulderField.at, {
      min: 0.3,
      max: 0.9,
    });
    const limbField = getField(obj, 'limbRadiusM', at);
    const limbRadiusM = readNumber(limbField.value, limbField.at, { min: 0.03, max: 0.15 });
    const headField = getField(obj, 'headRadiusM', at);
    const headRadiusM = readNumber(headField.value, headField.at, { min: 0.1, max: 0.3 });
    const leanField = getField(obj, 'leanDeg', at);
    const leanDeg = readNumber(leanField.value, leanField.at, { min: 0, max: 20 });

    if (2 * headRadiusM > 0.35 * heightM) {
      fail(headField.at, 'head diameter must be at most 35% of heightM');
    }

    table[id] = { id, heightM, shoulderWidthM, limbRadiusM, headRadiusM, leanDeg };
  }
  return table as BodyTypeTable;
}
