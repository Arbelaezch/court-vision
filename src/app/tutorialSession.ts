// App layer: the controls tutorial session ties the headless sandbox to a run clock. It takes no save
// store and never records an attempt, so the tutorial cannot touch progress (g12).
import {
  startTutorial,
  stepTutorial,
  type TutorialSandboxOptions,
  type TutorialState,
  type TutorialStepResult,
} from '../ai';
import type { GameState, SimAction } from '../sim';
import { createRunClock, type RunClock } from './runClock';

export interface TutorialSession {
  readonly clock: RunClock;
  state(): TutorialState;
  frame(
    frameDeltaMs: number,
    actionsFor: (game: GameState) => readonly SimAction[],
  ): TutorialStepResult[];
}

export function createTutorialSession(options: TutorialSandboxOptions): TutorialSession {
  const clock = createRunClock({ speed: 1 });
  let state = startTutorial(options);

  return {
    clock,
    state: () => state,
    frame(frameDeltaMs, actionsFor) {
      const n = clock.advance(frameDeltaMs);
      const results: TutorialStepResult[] = [];
      for (let i = 0; i < n; i++) {
        if (state.status === 'finished') break;
        const result = stepTutorial(state, actionsFor(state.game));
        state = result.state;
        results.push(result);
      }
      return results;
    },
  };
}
