import { describe, it, expect, vi } from 'vitest';
import { mountAudio } from './mountAudio';
import { createFakeAudioContext, FakeAudioContext, FakeOscillator } from './fakeAudioContext';
import type { GameEvent } from '../sim';

class StuckSuspendedContext extends FakeAudioContext {
  override resume(): Promise<void> {
    this.resumeCalls += 1;
    return Promise.resolve();
  }
}

const mistake: GameEvent = {
  type: 'mistake',
  tick: 0,
  kind: 'wrongTeammate',
  reason: 'Wrong teammate',
};

function setup(make: () => FakeAudioContext = () => createFakeAudioContext()) {
  const target = new EventTarget();
  const ctx = make();
  const createContext = vi.fn(() => ctx);
  const mounted = mountAudio({ target, createContext });
  return { target, ctx, createContext, ...mounted };
}

describe('mountAudio', () => {
  it('does not create a context before a gesture', () => {
    const { target, createContext, engine } = setup();
    target.dispatchEvent(new Event('mousemove'));
    target.dispatchEvent(new Event('resize'));
    expect(createContext).not.toHaveBeenCalled();
    expect(engine.isStarted()).toBe(false);
  });

  it.each(['pointerdown', 'keydown', 'touchend'])('unlocks on first %s', (name) => {
    const { target, createContext, engine } = setup();
    target.dispatchEvent(new Event(name));
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(engine.isStarted()).toBe(true);
  });

  it('removes listeners once the context is running', () => {
    const { target, ctx, createContext } = setup();
    target.dispatchEvent(new Event('pointerdown'));
    ctx.state = 'suspended';
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resumeCalls).toBe(0);
  });

  it('resumes again on a later gesture while the context stays suspended', () => {
    const { target, ctx, createContext } = setup(
      () => new StuckSuspendedContext({ state: 'suspended' }),
    );
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumeCalls).toBe(1);
    target.dispatchEvent(new Event('keydown'));
    expect(ctx.resumeCalls).toBe(2);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('does not unlock after unmount', () => {
    const { target, createContext, engine, unmount } = setup();
    const unlock = vi.spyOn(engine, 'unlock');
    unmount();
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(unlock).not.toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
  });

  it('closes an unlocked context exactly once on unmount', () => {
    const { target, ctx, unmount } = setup();
    target.dispatchEvent(new Event('keydown'));
    unmount();
    unmount();
    expect(ctx.closeCalls).toBe(1);
  });

  it('plays the whistle at the context time after a gesture', () => {
    const { target, ctx, engine } = setup(() => createFakeAudioContext({ currentTime: 3.25 }));
    target.dispatchEvent(new Event('keydown'));
    engine.handleEvent(mistake);
    const started = ctx.nodes.filter(
      (n): n is FakeOscillator => n instanceof FakeOscillator && n.startedAt === 3.25,
    );
    expect(started.length).toBeGreaterThan(0);
  });
});
