// Role types and loader. Roles reference archetypes by id; role ids come from the sim.

import { ROLE_ORDER } from '../sim';
import type { RoleId } from '../sim';
import type { ArchetypeId, ArchetypeTable } from './archetypes';
import {
  childPath,
  fail,
  getField,
  readArray,
  readBoolean,
  readEnum,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export type BodyType = 'guard' | 'wing' | 'big';
export const BODY_TYPES: readonly BodyType[] = ['guard', 'wing', 'big'];

export type MoveId =
  | 'move'
  | 'sprint'
  | 'pivot'
  | 'chestPass'
  | 'bouncePass'
  | 'lob'
  | 'handOff'
  | 'shoot'
  | 'floater'
  | 'callForScreen'
  | 'setScreen';
export const MOVE_IDS: readonly MoveId[] = [
  'move',
  'sprint',
  'pivot',
  'chestPass',
  'bouncePass',
  'lob',
  'handOff',
  'shoot',
  'floater',
  'callForScreen',
  'setScreen',
];

export interface Role {
  readonly id: RoleId;
  readonly name: string;
  readonly number: number;
  readonly bodyType: BodyType;
  readonly defaultArchetype: ArchetypeId;
  readonly moves: readonly MoveId[];
  readonly playable: boolean;
}

export type RoleTable = Readonly<Record<RoleId, Role>>;

const ROLE_KEYS = ['name', 'number', 'bodyType', 'defaultArchetype', 'moves', 'playable'] as const;

export function loadRoles(source: ContentSource, archetypes: ArchetypeTable): RoleTable {
  const rootAt = rootPath(source.file, 'roles');
  const root = readObject(source.data, rootAt);
  rejectUnknownKeys(root, ROLE_ORDER, rootAt);

  const numberOwners = new Map<number, RoleId>();
  const roles: Partial<Record<RoleId, Role>> = {};
  let anyPlayable = false;

  for (const id of ROLE_ORDER) {
    const roleField = getField(root, id, rootAt);
    const at = roleField.at;
    const obj = readObject(roleField.value, at);
    rejectUnknownKeys(obj, ROLE_KEYS, at);

    const nameField = getField(obj, 'name', at);
    const name = readString(nameField.value, nameField.at);

    const numberField = getField(obj, 'number', at);
    const number = readNumber(numberField.value, numberField.at, {
      min: 1,
      max: 5,
      integer: true,
    });
    const owner = numberOwners.get(number);
    if (owner !== undefined) {
      fail(numberField.at, `duplicate role number ${number} (also used by ${owner})`);
    }
    numberOwners.set(number, id);

    const bodyField = getField(obj, 'bodyType', at);
    const bodyType = readEnum(bodyField.value, BODY_TYPES, bodyField.at);

    const archField = getField(obj, 'defaultArchetype', at);
    const defaultArchetype = readString(archField.value, archField.at);
    if (!Object.hasOwn(archetypes, defaultArchetype)) {
      fail(archField.at, `unknown archetype "${defaultArchetype}"`);
    }

    const movesField = getField(obj, 'moves', at);
    const rawMoves = readArray(movesField.value, movesField.at);
    if (rawMoves.length === 0) fail(movesField.at, 'expected at least one move');
    const moves: MoveId[] = [];
    rawMoves.forEach((raw, i) => {
      const moveAt = childPath(movesField.at, i);
      const move = readEnum(raw, MOVE_IDS, moveAt);
      if (moves.includes(move)) fail(moveAt, `duplicate move "${move}"`);
      moves.push(move);
    });

    const playableField = getField(obj, 'playable', at);
    const playable = readBoolean(playableField.value, playableField.at);
    if (playable) anyPlayable = true;

    roles[id] = { id, name, number, bodyType, defaultArchetype, moves, playable };
  }

  if (!anyPlayable) fail(rootAt, 'expected at least one playable role');
  return roles as RoleTable;
}
