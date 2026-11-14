import { describe, expect, it } from 'vitest';
import type { InputAction } from './actions';
import {
  DEFAULT_BINDINGS,
  DEFAULT_DOUBLE_CLICK_WINDOW_MS,
  mouseButtonCode,
  validateBindings,
  type Binding,
} from './bindings';

describe('validateBindings', () => {
  it('accepts the default bindings', () => {
    expect(() => validateBindings(DEFAULT_BINDINGS)).not.toThrow();
  });

  it('rejects an unknown action', () => {
    const bad = [{ input: 'KeyX', action: 'nope' as InputAction }];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision: bindings\[0\]/);
  });

  it('rejects an unknown gesture', () => {
    const bad = [
      { input: 'Mouse0', action: 'chestPass', gesture: 'Double' },
    ] as unknown as Binding[];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision: bindings\[0\].*gesture/);
  });

  it('rejects a non-object entry', () => {
    const bad = [null] as unknown as Binding[];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision: bindings\[0\]/);
  });

  it('rejects a duplicate (input, gesture) pair', () => {
    const bad: Binding[] = [
      { input: 'KeyX', action: 'shoot' },
      { input: 'KeyX', action: 'floater', gesture: 'single' },
    ];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision: bindings\[1\]/);
  });

  it('rejects a double gesture on a held action', () => {
    const bad: Binding[] = [{ input: 'KeyX', action: 'sprint', gesture: 'double' }];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision:/);
  });

  it('rejects an input with both a held and a double binding', () => {
    const bad: Binding[] = [
      { input: 'KeyX', action: 'sprint' },
      { input: 'KeyX', action: 'lob', gesture: 'double' },
    ];
    expect(() => validateBindings(bad)).toThrow(/^Court Vision:/);
  });

  it('rejects an empty input', () => {
    expect(() => validateBindings([{ input: '', action: 'shoot' }])).toThrow(/^Court Vision:/);
  });

  it('exposes the default window and mouse codes', () => {
    expect(DEFAULT_DOUBLE_CLICK_WINDOW_MS).toBe(220);
    expect(mouseButtonCode(0)).toBe('Mouse0');
  });
});
