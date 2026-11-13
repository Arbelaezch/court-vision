// App layer: the v2 save document shape, its defaults and per-section validators.
// Each validator rebuilds a clean value (unknown fields dropped) or returns undefined when invalid.
import {
  DEFAULT_BINDINGS,
  DEFAULT_DOUBLE_CLICK_WINDOW_MS,
  validateBindings,
  type Binding,
} from '../../input';
import type { PassTargetingMode } from '../../sim';

export type ProgressMode = 'practice' | 'scrimmage';

/** Non-negative integers. */
export interface ModeProgress {
  readonly attempts: number;
  readonly successes: number;
}

export interface ProgressSection {
  readonly plays: Readonly<Record<string, Partial<Record<ProgressMode, ModeProgress>>>>;
}

export type PassTargeting = PassTargetingMode;

export interface SettingsSection {
  readonly passTargeting: PassTargeting;
  /** Finite, > 0. */
  readonly doubleClickWindowMs: number;
  /** Finite, > 0. */
  readonly aimSensitivity: number;
  /** volume in [0, 1]. */
  readonly audio: { readonly volume: number; readonly musicOn: boolean; readonly sfxOn: boolean };
  readonly cues: {
    readonly floorArrows: boolean;
    readonly targetRings: boolean;
    readonly prompts: boolean;
  };
}

export type BindingsSection = readonly Binding[];

/** Tooltip ids the player has already seen. */
export type SeenTooltipsSection = readonly string[];

export interface SaveDocument {
  readonly version: 2;
  readonly progress: ProgressSection;
  readonly settings: SettingsSection;
  readonly bindings: BindingsSection;
  readonly seenTooltips: SeenTooltipsSection;
}

export type SectionName = 'progress' | 'settings' | 'bindings' | 'seenTooltips';

export const SECTION_NAMES: readonly SectionName[] = [
  'progress',
  'settings',
  'bindings',
  'seenTooltips',
];

const PROGRESS_MODES: readonly ProgressMode[] = ['practice', 'scrimmage'];
const PASS_TARGETINGS: readonly PassTargeting[] = ['numbered', 'aim', 'both'];

/** Returns a fresh object each call, so callers may not share mutable state. */
export function defaultSaveDocument(): SaveDocument {
  return {
    version: 2,
    progress: { plays: {} },
    settings: {
      passTargeting: 'both',
      doubleClickWindowMs: DEFAULT_DOUBLE_CLICK_WINDOW_MS,
      aimSensitivity: 1,
      audio: { volume: 1, musicOn: true, sfxOn: true },
      cues: { floorArrows: true, targetRings: true, prompts: true },
    },
    bindings: DEFAULT_BINDINGS.map(copyBinding),
    seenTooltips: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function copyBinding(b: Binding): Binding {
  return b.gesture === undefined
    ? { input: b.input, action: b.action }
    : { input: b.input, action: b.action, gesture: b.gesture };
}

function readModeProgress(raw: unknown): ModeProgress | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isNonNegativeInt(raw.attempts) || !isNonNegativeInt(raw.successes)) return undefined;
  return { attempts: raw.attempts, successes: raw.successes };
}

function readPlayProgress(raw: unknown): Partial<Record<ProgressMode, ModeProgress>> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Partial<Record<ProgressMode, ModeProgress>> = {};
  for (const [mode, value] of Object.entries(raw)) {
    if (!isOneOf(mode, PROGRESS_MODES)) return undefined;
    const progress = readModeProgress(value);
    if (!progress) return undefined;
    out[mode] = progress;
  }
  return out;
}

function validateProgress(raw: unknown): ProgressSection | undefined {
  if (!isRecord(raw) || !isRecord(raw.plays)) return undefined;
  const entries: [string, Partial<Record<ProgressMode, ModeProgress>>][] = [];
  for (const [playId, value] of Object.entries(raw.plays)) {
    const play = readPlayProgress(value);
    if (!play) return undefined;
    entries.push([playId, play]);
  }
  // fromEntries defines own properties, so an id like "__proto__" cannot touch the prototype.
  return { plays: Object.fromEntries(entries) };
}

function validateSettings(raw: unknown): SettingsSection | undefined {
  if (!isRecord(raw) || !isRecord(raw.audio) || !isRecord(raw.cues)) return undefined;
  const { passTargeting, doubleClickWindowMs, aimSensitivity, audio, cues } = raw;
  if (!isOneOf(passTargeting, PASS_TARGETINGS)) return undefined;
  if (!isPositiveFinite(doubleClickWindowMs) || !isPositiveFinite(aimSensitivity)) return undefined;
  const { volume, musicOn, sfxOn } = audio;
  if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1)) return undefined;
  if (!isBoolean(musicOn) || !isBoolean(sfxOn)) return undefined;
  const { floorArrows, targetRings, prompts } = cues;
  if (!isBoolean(floorArrows) || !isBoolean(targetRings) || !isBoolean(prompts)) return undefined;
  return {
    passTargeting,
    doubleClickWindowMs,
    aimSensitivity,
    audio: { volume, musicOn, sfxOn },
    cues: { floorArrows, targetRings, prompts },
  };
}

function validateBindingsSection(raw: unknown): BindingsSection | undefined {
  if (!Array.isArray(raw)) return undefined;
  const bindings = raw as Binding[];
  try {
    validateBindings(bindings);
  } catch {
    return undefined;
  }
  return bindings.map(copyBinding);
}

function validateSeenTooltips(raw: unknown): SeenTooltipsSection | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids: string[] = [];
  for (const id of raw as unknown[]) {
    if (typeof id !== 'string' || id === '') return undefined;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export const SECTION_VALIDATORS: {
  readonly [K in SectionName]: (raw: unknown) => SaveDocument[K] | undefined;
} = {
  progress: validateProgress,
  settings: validateSettings,
  bindings: validateBindingsSection,
  seenTooltips: validateSeenTooltips,
};
