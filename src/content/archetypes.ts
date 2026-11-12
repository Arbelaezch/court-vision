// Archetype types and loader. Archetypes hold the per-player attribute tuning; the values
// themselves live in data/archetypes.ts.

import {
  ID_PATTERN,
  childPath,
  fail,
  getField,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export type ArchetypeId = string;

export interface ShootingByZone {
  readonly rim: number;
  readonly midRange: number;
  readonly three: number;
}

export interface Archetype {
  readonly id: ArchetypeId;
  readonly name: string;
  readonly speedMps: number;
  readonly accelerationMps2: number;
  readonly reachM: number;
  readonly strength: number;
  readonly shooting: ShootingByZone;
  readonly passing: number;
  readonly ballSecurity: number;
  readonly defensiveAwareness: number;
}

export type ArchetypeTable = Readonly<Record<ArchetypeId, Archetype>>;

const ARCHETYPE_KEYS = [
  'name',
  'speedMps',
  'accelerationMps2',
  'reachM',
  'strength',
  'shooting',
  'passing',
  'ballSecurity',
  'defensiveAwareness',
] as const;
const SHOOTING_KEYS = ['rim', 'midRange', 'three'] as const;

const rating = { min: 0, max: 100, integer: true } as const;

export function loadArchetypes(source: ContentSource): ArchetypeTable {
  const rootAt = rootPath(source.file, 'archetypes');
  const root = readObject(source.data, rootAt);
  const ids = Object.keys(root);
  if (ids.length === 0) fail(rootAt, 'expected at least one archetype');

  const table: Record<ArchetypeId, Archetype> = {};
  for (const id of ids) {
    const at = childPath(rootAt, id);
    if (!ID_PATTERN.test(id)) fail(at, 'invalid archetype id');
    const obj = readObject(root[id], at);
    rejectUnknownKeys(obj, ARCHETYPE_KEYS, at);

    const field = (key: string) => getField(obj, key, at);
    const num = (key: string, opts: { min?: number; max?: number; integer?: boolean }) => {
      const f = field(key);
      return readNumber(f.value, f.at, opts);
    };

    const nameField = field('name');
    const name = readString(nameField.value, nameField.at);
    const speedMps = num('speedMps', { min: 0.5, max: 12 });
    const accelerationMps2 = num('accelerationMps2', { min: 0.5, max: 30 });
    const reachM = num('reachM', { min: 1.5, max: 3.5 });
    const strength = num('strength', rating);

    const shootingField = field('shooting');
    const shootingObj = readObject(shootingField.value, shootingField.at);
    rejectUnknownKeys(shootingObj, SHOOTING_KEYS, shootingField.at);
    const zone = (key: string) => {
      const f = getField(shootingObj, key, shootingField.at);
      return readNumber(f.value, f.at, rating);
    };
    const shooting: ShootingByZone = {
      rim: zone('rim'),
      midRange: zone('midRange'),
      three: zone('three'),
    };

    const passing = num('passing', rating);
    const ballSecurity = num('ballSecurity', rating);
    const defensiveAwareness = num('defensiveAwareness', rating);

    table[id] = {
      id,
      name,
      speedMps,
      accelerationMps2,
      reachM,
      strength,
      shooting,
      passing,
      ballSecurity,
      defensiveAwareness,
    };
  }
  return table;
}
