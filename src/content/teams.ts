// Team types and loader. Colors are '#rrggbb' (lowercase); jersey numbers are per role.

import { ROLE_ORDER } from '../sim';
import type { RoleId, TeamSide } from '../sim';
import {
  fail,
  getField,
  readHexColor,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
  type FieldPath,
} from './validate';

export interface TeamColors {
  readonly primary: string;
  readonly secondary: string;
}

export interface Team {
  readonly side: TeamSide;
  readonly name: string;
  readonly colors: TeamColors;
  readonly jerseyNumbers: Readonly<Record<RoleId, number>>;
}

export type TeamCast = Readonly<Record<TeamSide, Team>>;

const SIDES: readonly TeamSide[] = ['offense', 'defense'];
const TEAM_KEYS = ['name', 'colors', 'jerseyNumbers'] as const;

function loadTeam(side: TeamSide, value: unknown, at: FieldPath): Team {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, TEAM_KEYS, at);

  const nameField = getField(obj, 'name', at);
  const name = readString(nameField.value, nameField.at);

  const colorsField = getField(obj, 'colors', at);
  const colorsObj = readObject(colorsField.value, colorsField.at);
  rejectUnknownKeys(colorsObj, ['primary', 'secondary'], colorsField.at);
  const primaryField = getField(colorsObj, 'primary', colorsField.at);
  const secondaryField = getField(colorsObj, 'secondary', colorsField.at);
  const colors: TeamColors = {
    primary: readHexColor(primaryField.value, primaryField.at),
    secondary: readHexColor(secondaryField.value, secondaryField.at),
  };

  const jerseysField = getField(obj, 'jerseyNumbers', at);
  const jerseysObj = readObject(jerseysField.value, jerseysField.at);
  rejectUnknownKeys(jerseysObj, ROLE_ORDER, jerseysField.at);
  const owners = new Map<number, RoleId>();
  const jerseyNumbers: Partial<Record<RoleId, number>> = {};
  for (const id of ROLE_ORDER) {
    const field = getField(jerseysObj, id, jerseysField.at);
    const n = readNumber(field.value, field.at, { min: 0, max: 99, integer: true });
    const owner = owners.get(n);
    if (owner !== undefined) fail(field.at, `duplicate jersey number ${n} (also used by ${owner})`);
    owners.set(n, id);
    jerseyNumbers[id] = n;
  }

  return { side, name, colors, jerseyNumbers: jerseyNumbers as Record<RoleId, number> };
}

export function loadTeams(source: ContentSource): TeamCast {
  const rootAt = rootPath(source.file, 'teams');
  const root = readObject(source.data, rootAt);
  rejectUnknownKeys(root, SIDES, rootAt);

  const teams: Partial<Record<TeamSide, Team>> = {};
  for (const side of SIDES) {
    const field = getField(root, side, rootAt);
    teams[side] = loadTeam(side, field.value, field.at);
  }
  const cast = teams as Record<TeamSide, Team>;

  if (cast.defense.colors.primary === cast.offense.colors.primary) {
    fail(
      { file: source.file, field: 'teams.defense.colors.primary' },
      'must differ from offense primary color',
    );
  }
  return cast;
}
