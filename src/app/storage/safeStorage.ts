// App layer: localStorage wrapper that never throws and falls back to memory.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Warn = (message: string, detail?: unknown) => void;

export interface SafeStorageOptions {
  /** Returns the real backend; may throw. Default: () => globalThis.localStorage */
  getBackend?: () => StorageLike | undefined;
  /** Default: console.warn */
  warn?: Warn;
}

const FALLBACK_MESSAGE =
  'Court Vision: storage unavailable, keeping data in memory for this session';

export function createSafeStorage(options: SafeStorageOptions = {}): StorageLike {
  const getBackend = options.getBackend ?? (() => globalThis.localStorage);
  const warn: Warn = options.warn ?? ((m, d) => console.warn(m, d));
  const memory = new Map<string, string>();
  let backend: StorageLike | undefined;
  let resolved = false;
  let memoryOnly = false;

  const enterMemoryMode = (err?: unknown): void => {
    if (memoryOnly) return;
    memoryOnly = true;
    try {
      warn(FALLBACK_MESSAGE, err);
    } catch {
      // never throw
    }
  };

  const resolveBackend = (): StorageLike | undefined => {
    if (memoryOnly) return undefined;
    if (!resolved) {
      resolved = true;
      try {
        backend = getBackend() ?? undefined;
      } catch (err) {
        enterMemoryMode(err);
        return undefined;
      }
      if (!backend) enterMemoryMode();
    }
    return memoryOnly ? undefined : backend;
  };

  return {
    getItem(key) {
      const b = resolveBackend();
      if (b) {
        try {
          const value = b.getItem(key);
          if (value === null || value === undefined) {
            memory.delete(key);
            return null;
          }
          memory.set(key, value);
          return value;
        } catch (err) {
          enterMemoryMode(err);
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      const b = resolveBackend();
      if (!b) return;
      try {
        b.setItem(key, value);
      } catch (err) {
        enterMemoryMode(err);
      }
    },
    removeItem(key) {
      memory.delete(key);
      const b = resolveBackend();
      if (!b) return;
      try {
        b.removeItem(key);
      } catch (err) {
        enterMemoryMode(err);
      }
    },
  };
}
