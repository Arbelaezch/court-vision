import { describe, expect, it, vi } from 'vitest';
import { bindUiClicks, isButtonClick } from './uiClicks';

function clickOn(target: EventTarget, hit: unknown): void {
  const event = new Event('click', { bubbles: true });
  Object.defineProperty(event, 'target', { value: hit });
  target.dispatchEvent(event);
}

const button = { closest: (sel: string) => (sel === 'button' ? {} : null) };
const plain = { closest: () => null };

describe('bindUiClicks', () => {
  it('plays once for a click on a button and not for other clicks', () => {
    const root = new EventTarget();
    const play = vi.fn();
    bindUiClicks(root, play);
    clickOn(root, button);
    expect(play).toHaveBeenCalledTimes(1);
    clickOn(root, plain);
    clickOn(root, {});
    clickOn(root, null);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops playing after unbind', () => {
    const root = new EventTarget();
    const play = vi.fn();
    const unbind = bindUiClicks(root, play);
    unbind();
    clickOn(root, button);
    expect(play).not.toHaveBeenCalled();
  });
});

describe('isButtonClick', () => {
  it('accepts only objects whose closest finds a button', () => {
    expect(isButtonClick(button)).toBe(true);
    expect(isButtonClick(plain)).toBe(false);
    expect(isButtonClick({ closest: 3 })).toBe(false);
    expect(isButtonClick(null)).toBe(false);
    expect(isButtonClick('button')).toBe(false);
  });
});
