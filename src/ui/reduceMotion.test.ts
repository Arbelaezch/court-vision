import { describe, expect, it, vi } from 'vitest';
import { REDUCE_MOTION_CLASS, createReduceMotionOutput } from './reduceMotion';

describe('createReduceMotionOutput', () => {
  it('toggles the cv-reduce-motion class on the document element', () => {
    const toggle = vi.fn();
    const doc = { documentElement: { classList: { toggle } } } as unknown as Document;
    const output = createReduceMotionOutput(doc);
    output.setReduceMotion(true);
    output.setReduceMotion(false);
    expect(REDUCE_MOTION_CLASS).toBe('cv-reduce-motion');
    expect(toggle).toHaveBeenNthCalledWith(1, 'cv-reduce-motion', true);
    expect(toggle).toHaveBeenNthCalledWith(2, 'cv-reduce-motion', false);
  });
});
