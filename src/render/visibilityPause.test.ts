import { describe, expect, it, vi } from 'vitest';
import { bindVisibilityPause } from './visibilityPause';

function setup(initialHidden: boolean) {
  const target = new EventTarget();
  const state = { hidden: initialHidden };
  const onPause = vi.fn();
  const onResume = vi.fn();
  const unbind = bindVisibilityPause({
    target,
    isHidden: () => state.hidden,
    onPause,
    onResume,
  });
  const change = (hidden: boolean): void => {
    state.hidden = hidden;
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return { onPause, onResume, unbind, change };
}

describe('bindVisibilityPause', () => {
  it('resumes once when visible at bind', () => {
    const { onPause, onResume } = setup(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('calls nothing when hidden at bind, then resumes once when visible', () => {
    const { onPause, onResume, change } = setup(true);
    expect(onResume).not.toHaveBeenCalled();
    expect(onPause).not.toHaveBeenCalled();
    change(false);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('pauses once on hidden, ignores duplicates, and resumes on visible', () => {
    const { onPause, onResume, change } = setup(false);
    change(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    change(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    change(false);
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('calls nothing after unbind', () => {
    const { onPause, onResume, unbind, change } = setup(false);
    unbind();
    change(true);
    change(false);
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
