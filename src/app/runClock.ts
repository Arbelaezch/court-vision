// Run-level pause for the fixed-timestep stepper (#43). Hiding the tab pauses the run and freezes all
// sim time (shot clock included); showing the tab does NOT resume, only the player's resume() does.
// Issue #24 (screen state machine) consumes onPause to open the pause menu.
import { advanceStepper, createStepper, type GameState, type StepperState } from '../sim';
import { bindVisibilityPause } from '../render/visibilityPause';

export type PauseReason = 'player' | 'hidden';

export interface RunClockOptions {
  speed?: number;
  onPause?: (reason: PauseReason) => void;
}

export interface RunClock {
  readonly stepper: StepperState;
  isPaused(): boolean;
  pauseReason(): PauseReason | null;
  pause(reason: PauseReason): void;
  resume(): void;
  advance(frameDeltaMs: number): number;
}

export function createRunClock(options: RunClockOptions = {}): RunClock {
  const stepper = createStepper(options.speed ?? 1);
  let paused: PauseReason | null = null;
  let discardNextDelta = false;

  return {
    stepper,
    isPaused: () => paused !== null,
    pauseReason: () => paused,
    pause(reason) {
      if (paused !== null) return;
      paused = reason;
      options.onPause?.(reason);
    },
    resume() {
      if (paused === null) return;
      paused = null;
      discardNextDelta = true;
    },
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`Court Vision: frame delta must be a finite number >= 0, got ${ms}`);
      }
      if (paused !== null) return 0;
      if (discardNextDelta) {
        discardNextDelta = false;
        return 0;
      }
      return advanceStepper(stepper, ms);
    },
  };
}

export function advanceRunFrame(
  clock: RunClock,
  state: GameState,
  frameDeltaMs: number,
  step: (state: GameState) => GameState,
): GameState {
  const n = clock.advance(frameDeltaMs);
  let s = state;
  for (let i = 0; i < n; i++) s = step(s);
  return s;
}

export interface RunVisibilityPauseOptions {
  target: EventTarget;
  isHidden: () => boolean;
  clock: RunClock;
}

export function bindRunVisibilityPause(options: RunVisibilityPauseOptions): () => void {
  const { target, isHidden, clock } = options;
  return bindVisibilityPause({
    target,
    isHidden,
    onPause: () => clock.pause('hidden'),
    // Showing the tab deliberately does not resume (#43); only the player's resume() does.
    onResume: () => {},
  });
}
