import { describe, expect, it, vi } from 'vitest';
import { createGame, stepGame, type GameEvent, type GameState } from '../sim';
import { TEST_MOVEMENT } from '../sim/testMovement';
import { advanceRunFrame, bindRunVisibilityPause, createRunClock } from './runClock';

const FRAME = 1000 / 60;

function setupVisibility() {
  const target = new EventTarget();
  const vis = { hidden: false };
  const onPause = vi.fn();
  const clock = createRunClock({ onPause });
  const unbind = bindRunVisibilityPause({ target, isHidden: () => vis.hidden, clock });
  const change = (hidden: boolean): void => {
    vis.hidden = hidden;
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return { clock, onPause, unbind, change };
}

describe('createRunClock', () => {
  it('sums to 60 steps over 60 frames of 1000/60 ms', () => {
    const clock = createRunClock();
    let sum = 0;
    for (let i = 0; i < 60; i++) sum += clock.advance(FRAME);
    expect(sum).toBe(60);
  });

  it('bounds a single 5000 ms frame to 15 steps', () => {
    expect(createRunClock().advance(5000)).toBe(15);
  });

  it('pauses with a reason, fires onPause once and takes no steps', () => {
    const onPause = vi.fn();
    const clock = createRunClock({ onPause });
    clock.advance(FRAME);
    const taken = clock.stepper.stepsTaken;
    clock.pause('player');
    expect(clock.isPaused()).toBe(true);
    expect(clock.pauseReason()).toBe('player');
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith('player');
    expect(clock.advance(250)).toBe(0);
    expect(clock.stepper.stepsTaken).toBe(taken);
  });

  it('keeps the first reason and does not re-fire onPause on a second pause', () => {
    const onPause = vi.fn();
    const clock = createRunClock({ onPause });
    clock.pause('player');
    clock.pause('hidden');
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(clock.pauseReason()).toBe('player');
  });

  it('discards the first delta after resume', () => {
    const clock = createRunClock();
    clock.pause('player');
    clock.resume();
    expect(clock.isPaused()).toBe(false);
    expect(clock.pauseReason()).toBeNull();
    expect(clock.advance(30000)).toBe(0);
    expect(clock.advance(FRAME)).toBe(1);
  });

  it('treats resume while running as a no-op', () => {
    const clock = createRunClock();
    clock.resume();
    expect(clock.advance(FRAME)).toBe(1);
  });

  it.each([-1, NaN])('throws for invalid delta %s even while paused', (d) => {
    const clock = createRunClock();
    clock.pause('player');
    expect(() => clock.advance(d)).toThrow(/frame delta/);
  });
});

describe('bindRunVisibilityPause', () => {
  it('pauses with reason hidden once, stays paused on show, and only resume() unpauses', () => {
    const { clock, onPause, change } = setupVisibility();
    change(true);
    expect(clock.isPaused()).toBe(true);
    expect(clock.pauseReason()).toBe('hidden');
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith('hidden');
    change(false);
    expect(clock.isPaused()).toBe(true);
    expect(clock.advance(30000)).toBe(0);
    clock.resume();
    expect(clock.isPaused()).toBe(false);
  });

  it('pauses again on a second hide after the player resumes', () => {
    const { clock, onPause, change } = setupVisibility();
    change(true);
    change(false);
    clock.resume();
    expect(clock.isPaused()).toBe(false);
    change(true);
    expect(clock.isPaused()).toBe(true);
    expect(clock.pauseReason()).toBe('hidden');
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('does not pause after unbind', () => {
    const { clock, unbind, change } = setupVisibility();
    unbind();
    change(true);
    expect(clock.isPaused()).toBe(false);
  });

  it('keeps a manual pause through hide and show', () => {
    const { clock, change } = setupVisibility();
    clock.pause('player');
    change(true);
    change(false);
    expect(clock.isPaused()).toBe(true);
    expect(clock.pauseReason()).toBe('player');
  });
});

describe('run clock with a real game', () => {
  it('freezes tick and shot clock while hidden and records no attempt events', () => {
    const { clock, change } = setupVisibility();
    const step = vi.fn((s: GameState) => stepGame(s, []));
    const events: GameEvent[] = [];
    let state = createGame({ seed: 1, shotClockSeconds: 24, movement: TEST_MOVEMENT });
    const feed = (ms: number): void => {
      state = advanceRunFrame(clock, state, ms, step);
      events.push(...state.events);
    };

    for (let i = 0; i < 60; i++) feed(FRAME);
    const shotClock = state.shotClockTicks;
    const tick = state.tick;
    expect(shotClock).toBe(24 * 60 - 60);
    expect(tick).toBe(60);
    expect(step).toHaveBeenCalledTimes(60);

    change(true);
    for (let i = 0; i < 120; i++) feed(250);
    feed(30000);
    change(false);
    feed(30000);
    expect(step).toHaveBeenCalledTimes(60);
    expect(state.shotClockTicks).toBe(shotClock);
    expect(state.tick).toBe(tick);

    clock.resume();
    feed(30000);
    expect(step).toHaveBeenCalledTimes(60);
    expect(state.shotClockTicks).toBe(shotClock);
    expect(state.tick).toBe(tick);

    feed(FRAME);
    expect(state.tick).toBe(tick + 1);
    expect(state.shotClockTicks).toBe((shotClock as number) - 1);

    const types = events.map((e) => e.type as string);
    for (const t of ['mistake', 'runSuccess', 'runUnsuccessful']) {
      expect(types).not.toContain(t);
    }
  });
});
