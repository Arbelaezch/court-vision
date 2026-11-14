// Mode configs as validated data (DESIGN_DOC sections 5 and 8, "Cue levels are configuration").
// Every file in `src/content/data/modes/` must be listed in BUNDLED_MODE_SOURCES below, and each
// file is named `<modeId>.ts`. modes.test.ts fails when a file is missing from the registry.
// Adding a mode such as Live Play is a new data file, with no code change.

import { DEFENSE_MODES, type DefenseMode } from '../sim';
import { PRACTICE_MODE_DATA, PRACTICE_MODE_FILE } from './data/modes/practice';
import { CUE_LEVELS, type CueLevel } from './plays';
import {
  childPath,
  fail,
  getField,
  readEnum,
  readId,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

// Referee rule sets. These are code (each one is a branch in the referee); mode ids are data.
export const MODE_RULES = ['practice', 'scrimmage'] as const;
export type ModeRules = (typeof MODE_RULES)[number];

/** A camelCase content id (ID_PATTERN). New modes are new data files. */
export type ModeId = string;

export interface ModeConfig {
  readonly id: ModeId;
  readonly name: string;
  readonly rules: ModeRules;
  readonly cueLevel: CueLevel;
  readonly defense: DefenseMode;
  readonly speedMultiplier: number;
  /** Seconds; null = no shot clock. */
  readonly shotClockSeconds: number | null;
}

export const SPEED_MULTIPLIER_RANGE = { min: 0.25, max: 2 } as const;
export const SHOT_CLOCK_SECONDS_RANGE = { min: 1, max: 60 } as const;

export type ModeTable = Readonly<Record<ModeId, ModeConfig>>;

export const BUNDLED_MODE_SOURCES: readonly ContentSource[] = [
  { file: PRACTICE_MODE_FILE, data: PRACTICE_MODE_DATA },
];

const MODE_FIELDS = [
  'id',
  'name',
  'rules',
  'cueLevel',
  'defense',
  'speedMultiplier',
  'shotClockSeconds',
] as const;

export function readModeConfig(source: ContentSource): ModeConfig {
  const rootAt = rootPath(source.file, 'mode');
  const obj = readObject(source.data, rootAt);
  const idField = getField(obj, 'id', rootAt);
  const id = readId(idField.value, idField.at);

  // From here on every field path is rooted at the mode id, so errors name it.
  const at = rootPath(source.file, id);
  rejectUnknownKeys(obj, MODE_FIELDS, at);
  const name = getField(obj, 'name', at);
  const rules = getField(obj, 'rules', at);
  const cueLevel = getField(obj, 'cueLevel', at);
  const defense = getField(obj, 'defense', at);
  const speed = getField(obj, 'speedMultiplier', at);
  const clock = getField(obj, 'shotClockSeconds', at);
  return {
    id,
    name: readString(name.value, name.at),
    rules: readEnum(rules.value, MODE_RULES, rules.at),
    cueLevel: readEnum(cueLevel.value, CUE_LEVELS, cueLevel.at),
    defense: readEnum(defense.value, DEFENSE_MODES, defense.at),
    speedMultiplier: readNumber(speed.value, speed.at, SPEED_MULTIPLIER_RANGE),
    shotClockSeconds:
      clock.value === null ? null : readNumber(clock.value, clock.at, SHOT_CLOCK_SECONDS_RANGE),
  };
}

export function loadModes(sources: readonly ContentSource[] = BUNDLED_MODE_SOURCES): ModeTable {
  const table: Record<ModeId, ModeConfig> = {};
  const files = new Map<string, string>();
  for (const source of sources) {
    const mode = readModeConfig(source);
    const otherFile = files.get(mode.id);
    if (otherFile !== undefined) {
      fail(
        childPath(rootPath(source.file, mode.id), 'id'),
        `duplicate mode id "${mode.id}" (also in ${otherFile})`,
      );
    }
    files.set(mode.id, source.file);
    table[mode.id] = mode;
  }
  return table;
}

export function loadMode(
  id: ModeId,
  sources: readonly ContentSource[] = BUNDLED_MODE_SOURCES,
): ModeConfig {
  const table = loadModes(sources);
  const mode = Object.hasOwn(table, id) ? table[id] : undefined;
  if (mode === undefined) throw new Error(`Court Vision: unknown mode ${id}`);
  return mode;
}
