// App layer: in-memory Storage test double with failure flags. Not exported from the barrel.

import type { StorageLike } from './safeStorage';

export interface FakeStorage extends StorageLike {
  readonly data: Map<string, string>;
  throwOnGet: boolean;
  throwOnSet: boolean;
  throwOnRemove: boolean;
}

export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const data = new Map<string, string>(Object.entries(initial));
  const fake: FakeStorage = {
    data,
    throwOnGet: false,
    throwOnSet: false,
    throwOnRemove: false,
    getItem(key) {
      if (fake.throwOnGet) throw new Error('fake storage failure');
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (fake.throwOnSet) throw new Error('fake storage failure');
      data.set(key, value);
    },
    removeItem(key) {
      if (fake.throwOnRemove) throw new Error('fake storage failure');
      data.delete(key);
    },
  };
  return fake;
}
