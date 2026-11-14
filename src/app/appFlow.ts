// App flow controller: owns the screen machine, the single live run session, the visibility binding
// and a renderer port. DOM-free (only EventTarget types), so node tests and the browser share it.
import type { RunControllerOptions, RunControllerState } from '../ai';
import type { ModeId, ModeTable, ScenarioTable } from '../content';
import type { PressAction } from '../input';
import type { SimAction } from '../sim';
import { bindRunVisibilityPause } from './runClock';
import { createRunSession, type RunSession } from './runSession';
import {
  createScreenMachine,
  escapeEvent,
  transitionScreen,
  type ScreenEvent,
  type ScreenState,
  type TransitionResult,
} from './screens';
import type { SaveStore } from './storage';

export type MovementSetup = RunControllerOptions['movement'];
export type PassingSetup = RunControllerOptions['passing'];
export type ShootingSetup = NonNullable<RunControllerOptions['shooting']>;

export interface RunRenderer {
  /** Called every frame while a session exists (inRun or paused) with the current controller. */
  drawRun(controller: RunControllerState): void;
  /** Called when the session ends (quit or dispose). */
  clear(): void;
}

export interface PlayListItem {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly difficulty: number;
}

export interface MenuLabels {
  readonly plays: readonly PlayListItem[];
  readonly modeNames: Readonly<Record<ModeId, string>>;
}

export interface AppContent {
  readonly plays: ScenarioTable;
  readonly modes: ModeTable;
  readonly movement: MovementSetup;
  readonly passing: PassingSetup;
  readonly shooting: ShootingSetup;
}

export interface AppFlowOptions {
  content: AppContent;
  store: SaveStore;
  renderer: RunRenderer;
  /** Default: a random uint32 per run session. */
  seed?: () => number;
  /** Browser: { target: document, isHidden: () => document.hidden }. Omit to skip tab-visibility pause. */
  visibility?: { target: EventTarget; isHidden: () => boolean };
  /** Per-step SimActions for the human; default () => [] (the practice-slice maps input later). */
  actionsFor?: (controller: RunControllerState) => readonly SimAction[];
}

export interface AppFlow {
  state(): ScreenState;
  send(event: ScreenEvent): TransitionResult;
  handleAction(action: PressAction): void;
  frame(frameDeltaMs: number): void;
  labels(): MenuLabels;
  session(): RunSession | null;
  onChange(listener: (state: ScreenState) => void): () => void;
  dispose(): void;
}

/** Play Select order: difficulty ascending, then id. */
export function sortPlayList(plays: ScenarioTable): PlayListItem[] {
  return Object.values(plays)
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, difficulty: p.difficulty }));
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function createAppFlow(options: AppFlowOptions): AppFlow {
  const { content, store, renderer } = options;
  const seed = options.seed ?? randomSeed;
  const actionsFor = options.actionsFor ?? (() => []);
  const machine = createScreenMachine();
  const unsubscribers = new Set<() => void>();
  const modeNames: Record<ModeId, string> = {};
  for (const [id, mode] of Object.entries(content.modes)) modeNames[id] = mode.name;
  const menuLabels: MenuLabels = { plays: sortPlayList(content.plays), modeNames };

  let session: RunSession | null = null;
  let unbindVisibility: (() => void) | null = null;

  function handleClockPause(): void {
    if (machine.state().screen === 'inRun') machine.send({ type: 'pause' });
  }

  function requireSession(): RunSession {
    if (session === null) {
      throw new Error(`Court Vision: no run session in ${machine.state().screen}`);
    }
    return session;
  }

  function endSession(): void {
    session?.quit();
    unbindVisibility?.();
    renderer.clear();
    session = null;
    unbindVisibility = null;
  }

  function send(event: ScreenEvent): TransitionResult {
    const state = machine.state();
    const checked = transitionScreen(state, event);
    if (!checked.ok) return checked;

    switch (event.type) {
      case 'selectPlay': {
        const modeId = 'modeId' in state ? state.modeId : '';
        if (!Object.hasOwn(content.plays, event.playId) || !Object.hasOwn(content.modes, modeId)) {
          return { ok: false, from: 'playSelect', event: 'selectPlay' };
        }
        const play = content.plays[event.playId];
        const mode = content.modes[modeId];
        if (play === undefined || mode === undefined) {
          return { ok: false, from: 'playSelect', event: 'selectPlay' };
        }
        if (session !== null) endSession();
        session = createRunSession(play, mode, {
          seed: seed(),
          movement: content.movement,
          passing: content.passing,
          shooting: content.shooting,
          store,
          onPause: handleClockPause,
        });
        if (options.visibility) {
          unbindVisibility = bindRunVisibilityPause({
            target: options.visibility.target,
            isHidden: options.visibility.isHidden,
            clock: session.clock,
          });
        }
        return machine.send(event);
      }
      case 'pause': {
        requireSession().clock.pause('player');
        if (machine.state().screen === 'inRun') machine.send(event);
        return { ok: true, state: machine.state() };
      }
      case 'resume': {
        const result = machine.send(event);
        requireSession().clock.resume();
        return result;
      }
      case 'restart': {
        const s = requireSession();
        s.restart();
        s.clock.resume();
        return machine.send(event);
      }
      case 'quit':
        endSession();
        return machine.send(event);
      default:
        return machine.send(event);
    }
  }

  return {
    state: () => machine.state(),
    send,
    handleAction(action) {
      if (action !== 'pause') return;
      const event = escapeEvent(machine.state().screen);
      if (event !== null) send(event);
    },
    frame(frameDeltaMs) {
      if (session === null) return;
      session.frame(frameDeltaMs, actionsFor);
      renderer.drawRun(session.state());
    },
    labels: () => menuLabels,
    session: () => session,
    onChange(listener) {
      const off = machine.onChange(listener);
      unsubscribers.add(off);
      return () => {
        off();
        unsubscribers.delete(off);
      };
    },
    dispose() {
      if (session !== null) endSession();
      for (const off of unsubscribers) off();
      unsubscribers.clear();
    },
  };
}
