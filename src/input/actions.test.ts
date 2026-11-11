import { describe, expect, it } from 'vitest';
import { HELD_ACTIONS, PRESS_ACTIONS, passTargetSlot } from './actions';

describe('actions', () => {
  it('keeps held and press action lists disjoint', () => {
    const held: readonly string[] = HELD_ACTIONS;
    expect(PRESS_ACTIONS.filter((a) => held.includes(a))).toEqual([]);
  });

  it('maps pass target actions to slots 1-4 and others to null', () => {
    expect(passTargetSlot('passTarget1')).toBe(1);
    expect(passTargetSlot('passTarget2')).toBe(2);
    expect(passTargetSlot('passTarget3')).toBe(3);
    expect(passTargetSlot('passTarget4')).toBe(4);
    expect(passTargetSlot('shoot')).toBeNull();
  });
});
