import { describe, expect, it } from 'vitest';
import { createFakeStorage } from './fakeStorage';
import { createSafeStorage } from './safeStorage';

function setup(fake = createFakeStorage()) {
  const warnings: string[] = [];
  const storage = createSafeStorage({
    getBackend: () => fake,
    warn: (m) => warnings.push(m),
  });
  return { fake, warnings, storage };
}

describe('createSafeStorage', () => {
  it('round-trips through a working backend without warning', () => {
    const { fake, warnings, storage } = setup();
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    expect(fake.data.get('k')).toBe('v');
    expect(warnings).toEqual([]);
  });

  it('keeps data in memory and warns once when setItem throws', () => {
    const { fake, warnings, storage } = setup();
    fake.throwOnSet = true;
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(storage.getItem('k')).toBe('v');
    expect(() => storage.setItem('k', 'w')).not.toThrow();
    expect(storage.getItem('k')).toBe('w');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Court Vision: /);
  });

  it('works in memory when getBackend throws', () => {
    const warnings: string[] = [];
    const storage = createSafeStorage({
      getBackend: () => {
        throw new Error('SecurityError');
      },
      warn: (m) => warnings.push(m),
    });
    expect(storage.getItem('k')).toBeNull();
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(storage.getItem('k')).toBe('v');
    expect(() => storage.removeItem('k')).not.toThrow();
    expect(storage.getItem('k')).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('works in memory when getBackend returns undefined', () => {
    const warnings: string[] = [];
    const storage = createSafeStorage({
      getBackend: () => undefined,
      warn: (m) => warnings.push(m),
    });
    expect(storage.getItem('k')).toBeNull();
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('returns the mirrored value when getItem later throws', () => {
    const { fake, warnings, storage } = setup(createFakeStorage({ k: 'v' }));
    expect(storage.getItem('k')).toBe('v');
    fake.throwOnGet = true;
    expect(storage.getItem('k')).toBe('v');
    expect(warnings).toHaveLength(1);
  });

  it('does not throw when removeItem throws', () => {
    const { fake, warnings, storage } = setup();
    storage.setItem('k', 'v');
    fake.throwOnRemove = true;
    expect(() => storage.removeItem('k')).not.toThrow();
    expect(storage.getItem('k')).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
