import { describe, expect, it, vi } from 'vitest';
import {
  createScreenMachine,
  escapeEvent,
  SCREEN_TRANSITIONS,
  transitionScreen,
  type ScreenEvent,
  type ScreenEventType,
  type ScreenId,
  type ScreenState,
} from './screens';

const SCREEN_IDS: readonly ScreenId[] = [
  'mainMenu',
  'tutorial',
  'scrimmage',
  'settings',
  'progress',
  'playSelect',
  'inRun',
  'paused',
];

const STATES: Record<ScreenId, ScreenState> = {
  mainMenu: { screen: 'mainMenu' },
  tutorial: { screen: 'tutorial' },
  scrimmage: { screen: 'scrimmage' },
  settings: { screen: 'settings' },
  progress: { screen: 'progress' },
  playSelect: { screen: 'playSelect', modeId: 'practice' },
  inRun: { screen: 'inRun', modeId: 'practice', playId: 'giveAndGo' },
  paused: { screen: 'paused', modeId: 'practice', playId: 'giveAndGo' },
};

const EVENTS: Record<ScreenEventType, ScreenEvent> = {
  openTutorial: { type: 'openTutorial' },
  openPractice: { type: 'openPractice' },
  openScrimmage: { type: 'openScrimmage' },
  openSettings: { type: 'openSettings' },
  openProgress: { type: 'openProgress' },
  back: { type: 'back' },
  selectPlay: { type: 'selectPlay', playId: 'giveAndGo' },
  pause: { type: 'pause' },
  resume: { type: 'resume' },
  restart: { type: 'restart' },
  quit: { type: 'quit' },
};

describe('transitionScreen', () => {
  it('walks the happy path keeping modeId and playId', () => {
    const machine = createScreenMachine();
    const step = (event: ScreenEvent): ScreenState => {
      const result = machine.send(event);
      expect(result.ok).toBe(true);
      return machine.state();
    };
    expect(step({ type: 'openPractice' })).toEqual({ screen: 'playSelect', modeId: 'practice' });
    expect(step({ type: 'selectPlay', playId: 'giveAndGo' })).toEqual({
      screen: 'inRun',
      modeId: 'practice',
      playId: 'giveAndGo',
    });
    const paused = { screen: 'paused', modeId: 'practice', playId: 'giveAndGo' };
    const inRun = { screen: 'inRun', modeId: 'practice', playId: 'giveAndGo' };
    expect(step({ type: 'pause' })).toEqual(paused);
    expect(step({ type: 'resume' })).toEqual(inRun);
    expect(step({ type: 'pause' })).toEqual(paused);
    expect(step({ type: 'restart' })).toEqual(inRun);
    expect(step({ type: 'pause' })).toEqual(paused);
    expect(step({ type: 'quit' })).toEqual({ screen: 'playSelect', modeId: 'practice' });
  });

  it.each([
    ['openTutorial', 'tutorial'],
    ['openScrimmage', 'scrimmage'],
    ['openSettings', 'settings'],
    ['openProgress', 'progress'],
  ] as const)('%s reaches %s and back returns to the main menu', (type, screen) => {
    const machine = createScreenMachine();
    expect(machine.send({ type })).toEqual({ ok: true, state: { screen } });
    expect(machine.send({ type: 'back' })).toEqual({ ok: true, state: { screen: 'mainMenu' } });
  });

  it('playSelect back returns to the main menu', () => {
    expect(transitionScreen(STATES.playSelect, { type: 'back' })).toEqual({
      ok: true,
      state: { screen: 'mainMenu' },
    });
  });

  it.each([
    ['inRun', 'openSettings'],
    ['inRun', 'quit'],
    ['inRun', 'back'],
    ['inRun', 'resume'],
    ['paused', 'openSettings'],
    ['paused', 'pause'],
    ['mainMenu', 'selectPlay'],
    ['mainMenu', 'pause'],
    ['playSelect', 'pause'],
    ['settings', 'openProgress'],
  ] as const)('rejects %s + %s', (screen, type) => {
    expect(transitionScreen(STATES[screen], EVENTS[type])).toEqual({
      ok: false,
      from: screen,
      event: type,
    });
  });

  it('accepts exactly the events listed in SCREEN_TRANSITIONS', () => {
    for (const screen of SCREEN_IDS) {
      for (const type of Object.keys(EVENTS) as ScreenEventType[]) {
        const result = transitionScreen(STATES[screen], EVENTS[type]);
        expect(result.ok, `${screen} + ${type}`).toBe(SCREEN_TRANSITIONS[screen].includes(type));
      }
    }
  });
});

describe('createScreenMachine', () => {
  it('leaves state unchanged and notifies nobody on a rejected send', () => {
    const machine = createScreenMachine();
    const listener = vi.fn();
    machine.onChange(listener);
    expect(machine.send({ type: 'pause' }).ok).toBe(false);
    expect(machine.state()).toEqual({ screen: 'mainMenu' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies once per accepted send and stops after unsubscribe', () => {
    const machine = createScreenMachine();
    const listener = vi.fn();
    const off = machine.onChange(listener);
    machine.send({ type: 'openSettings' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ screen: 'settings' });
    off();
    machine.send({ type: 'back' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('escapeEvent', () => {
  it('maps each screen to its Esc meaning', () => {
    expect(escapeEvent('inRun')).toEqual({ type: 'pause' });
    expect(escapeEvent('paused')).toEqual({ type: 'resume' });
    expect(escapeEvent('mainMenu')).toBeNull();
    for (const screen of ['playSelect', 'tutorial', 'scrimmage', 'settings', 'progress'] as const) {
      expect(escapeEvent(screen)).toEqual({ type: 'back' });
    }
  });
});
