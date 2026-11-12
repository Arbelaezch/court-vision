// App layer: the versioned save store. One JSON document under SAVE_STORAGE_KEY with a top-level
// `version`; loads migrate step by step to CURRENT_VERSION, then repair each section on its own (g12).
import { CURRENT_VERSION, MIGRATIONS } from './migrations';
import { createSafeStorage, type StorageLike, type Warn } from './safeStorage';
import {
  SECTION_VALIDATORS,
  defaultSaveDocument,
  type SaveDocument,
  type SectionName,
} from './schema';

export const SAVE_STORAGE_KEY = 'court-vision:save';

export interface SaveStoreOptions {
  /** Default: globalThis.localStorage (wrapped so it never throws). */
  storage?: StorageLike;
  /** Default: console.warn */
  warn?: Warn;
  /** Default: SAVE_STORAGE_KEY */
  key?: string;
}

export interface SaveStore {
  get<K extends SectionName>(name: K): SaveDocument[K];
  /** Persists the whole document; never throws. */
  set<K extends SectionName>(name: K, value: SaveDocument[K]): void;
  /** Resets one section to its default and persists. */
  reset(name: SectionName): void;
  /** Resets progress and seenTooltips (g6) and persists; settings and bindings are kept. */
  resetProgress(): void;
  snapshot(): SaveDocument;
}

const CORRUPT_MESSAGE = 'Court Vision: saved data is corrupt, using defaults';

/** Marker: the blob was written by a newer build; it must never be overwritten. */
const NEWER_VERSION = Symbol('newer-version');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Parses and migrates a blob to the current version, or returns undefined after warning. */
function migrateBlob(
  blob: string,
  warn: Warn,
): Record<string, unknown> | typeof NEWER_VERSION | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch (err) {
    warn(CORRUPT_MESSAGE, err);
    return undefined;
  }
  if (!isRecord(parsed) || !isPositiveInt(parsed.version)) {
    warn(CORRUPT_MESSAGE);
    return undefined;
  }
  const version = parsed.version;
  if (version > CURRENT_VERSION) {
    warn(
      `Court Vision: saved data version ${version} is newer than ${CURRENT_VERSION}, using defaults and not saving this session`,
    );
    return NEWER_VERSION;
  }
  let doc = parsed;
  for (let v = version; v < CURRENT_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (!migration) {
      warn(`Court Vision: no migration from saved data version ${v}, using defaults`);
      return undefined;
    }
    try {
      doc = migration(doc);
    } catch (err) {
      warn(`Court Vision: migrating saved data from version ${v} failed, using defaults`, err);
      return undefined;
    }
  }
  return doc;
}

function repairSections(raw: Record<string, unknown>, warn: Warn): SaveDocument {
  const defaults = defaultSaveDocument();
  const pick = <K extends SectionName>(name: K): SaveDocument[K] => {
    const value = SECTION_VALIDATORS[name](raw[name]);
    if (value !== undefined) return value;
    warn(`Court Vision: saved section "${name}" is invalid, reset to defaults`);
    return defaults[name];
  };
  // Same order as SECTION_NAMES.
  return {
    version: 2,
    progress: pick('progress'),
    settings: pick('settings'),
    bindings: pick('bindings'),
    seenTooltips: pick('seenTooltips'),
  };
}

export function createSaveStore(options: SaveStoreOptions = {}): SaveStore {
  const warn: Warn = options.warn ?? ((m, d) => console.warn(m, d));
  const key = options.key ?? SAVE_STORAGE_KEY;
  const storage = createSafeStorage({
    getBackend: () => options.storage ?? globalThis.localStorage,
    warn,
  });

  // Set when the stored save is from a newer build: keep it intact, run on in-memory defaults.
  let readOnly = false;

  const persist = (): void => {
    if (readOnly) return;
    storage.setItem(key, JSON.stringify(doc));
  };

  const load = (): SaveDocument => {
    const blob = storage.getItem(key);
    if (blob === null) return defaultSaveDocument();
    const migrated = migrateBlob(blob, warn);
    if (migrated === NEWER_VERSION) {
      readOnly = true;
      return defaultSaveDocument();
    }
    const loaded = migrated ? repairSections(migrated, warn) : defaultSaveDocument();
    // Anything migrated, repaired or dropped changes the serialized form; write it back once.
    if (JSON.stringify(loaded) !== blob) storage.setItem(key, JSON.stringify(loaded));
    return loaded;
  };

  let doc: SaveDocument = load();

  return {
    get(name) {
      return doc[name];
    },
    set(name, value) {
      doc = { ...doc, [name]: value };
      persist();
    },
    reset(name) {
      doc = { ...doc, [name]: defaultSaveDocument()[name] };
      persist();
    },
    resetProgress() {
      const defaults = defaultSaveDocument();
      doc = { ...doc, progress: defaults.progress, seenTooltips: defaults.seenTooltips };
      persist();
    },
    snapshot() {
      return doc;
    },
  };
}
