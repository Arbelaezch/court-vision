// Screen state machine (DESIGN_DOC screen flow). Pure and DOM-free: illegal transitions are
// returned as `ok: false`, never thrown, so a stray Esc or double click cannot crash the app.

import type { ModeId } from '../content';

export type ScreenId =
  | 'mainMenu'
  | 'tutorial'
  | 'scrimmage'
  | 'settings'
  | 'progress'
  | 'playSelect'
  | 'inRun'
  | 'paused';

export type ScreenState =
  | { readonly screen: 'mainMenu' }
  | { readonly screen: 'tutorial' }
  | { readonly screen: 'scrimmage' }
  | { readonly screen: 'settings' }
  | { readonly screen: 'progress' }
  | { readonly screen: 'playSelect'; readonly modeId: ModeId }
  | { readonly screen: 'inRun'; readonly modeId: ModeId; readonly playId: string }
  | { readonly screen: 'paused'; readonly modeId: ModeId; readonly playId: string };

export type ScreenEvent =
  | { readonly type: 'openTutorial' }
  | { readonly type: 'openPractice' }
  | { readonly type: 'openScrimmage' }
  | { readonly type: 'openSettings' }
  | { readonly type: 'openProgress' }
  | { readonly type: 'back' }
  | { readonly type: 'selectPlay'; readonly playId: string }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'restart' }
  | { readonly type: 'quit' };

export type ScreenEventType = ScreenEvent['type'];

export type TransitionResult =
  | { readonly ok: true; readonly state: ScreenState }
  | { readonly ok: false; readonly from: ScreenId; readonly event: ScreenEventType };

export const PRACTICE_MODE_ID: ModeId = 'practice';
export const INITIAL_SCREEN: ScreenState = { screen: 'mainMenu' };

export const SCREEN_TRANSITIONS: Readonly<Record<ScreenId, readonly ScreenEventType[]>> = {
  mainMenu: ['openTutorial', 'openPractice', 'openScrimmage', 'openSettings', 'openProgress'],
  tutorial: ['back'],
  scrimmage: ['back'],
  settings: ['back'],
  progress: ['back'],
  playSelect: ['back', 'selectPlay'],
  inRun: ['pause'],
  paused: ['resume', 'restart', 'quit'],
};

function accept(state: ScreenState): TransitionResult {
  return { ok: true, state };
}

export function transitionScreen(state: ScreenState, event: ScreenEvent): TransitionResult {
  const reject: TransitionResult = { ok: false, from: state.screen, event: event.type };
  switch (state.screen) {
    case 'mainMenu':
      switch (event.type) {
        case 'openTutorial':
          return accept({ screen: 'tutorial' });
        case 'openPractice':
          return accept({ screen: 'playSelect', modeId: PRACTICE_MODE_ID });
        case 'openScrimmage':
          return accept({ screen: 'scrimmage' });
        case 'openSettings':
          return accept({ screen: 'settings' });
        case 'openProgress':
          return accept({ screen: 'progress' });
        default:
          return reject;
      }
    case 'tutorial':
    case 'scrimmage':
    case 'settings':
    case 'progress':
      return event.type === 'back' ? accept(INITIAL_SCREEN) : reject;
    case 'playSelect':
      if (event.type === 'back') return accept(INITIAL_SCREEN);
      if (event.type === 'selectPlay') {
        return accept({ screen: 'inRun', modeId: state.modeId, playId: event.playId });
      }
      return reject;
    case 'inRun':
      return event.type === 'pause'
        ? accept({ screen: 'paused', modeId: state.modeId, playId: state.playId })
        : reject;
    case 'paused':
      switch (event.type) {
        case 'resume':
        case 'restart':
          return accept({ screen: 'inRun', modeId: state.modeId, playId: state.playId });
        case 'quit':
          return accept({ screen: 'playSelect', modeId: state.modeId });
        default:
          return reject;
      }
    default: {
      const unreachable: never = state;
      throw new Error(`Court Vision: unknown screen ${JSON.stringify(unreachable)}`);
    }
  }
}

/** What the Esc / gamepad Start press means on each screen; null when it does nothing. */
export function escapeEvent(screen: ScreenId): ScreenEvent | null {
  switch (screen) {
    case 'inRun':
      return { type: 'pause' };
    case 'paused':
      return { type: 'resume' };
    case 'playSelect':
    case 'tutorial':
    case 'scrimmage':
    case 'settings':
    case 'progress':
      return { type: 'back' };
    case 'mainMenu':
      return null;
    default: {
      const unreachable: never = screen;
      throw new Error(`Court Vision: unknown screen ${String(unreachable)}`);
    }
  }
}

export interface ScreenMachine {
  state(): ScreenState;
  send(event: ScreenEvent): TransitionResult;
  onChange(listener: (state: ScreenState) => void): () => void;
}

export function createScreenMachine(initial: ScreenState = INITIAL_SCREEN): ScreenMachine {
  let current = initial;
  const listeners = new Set<(state: ScreenState) => void>();
  return {
    state: () => current,
    send(event) {
      const result = transitionScreen(current, event);
      if (result.ok) {
        current = result.state;
        for (const listener of [...listeners]) listener(current);
      }
      return result;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
