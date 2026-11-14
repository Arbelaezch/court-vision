import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS, loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import { SIM_HZ, type SimAction } from '../sim';
import {
  currentTutorialStep,
  startTutorial,
  stepTutorial,
  type TutorialState,
  type TutorialStepResult,
} from './index';

const OPTIONS = {
  seed: 7,
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const SG = 1;

function run(
  state: TutorialState,
  actionsFor: (s: TutorialState) => SimAction[],
  maxSteps: number,
  until: (r: TutorialStepResult) => boolean = () => false,
): { state: TutorialState; results: TutorialStepResult[] } {
  const results: TutorialStepResult[] = [];
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    const result = stepTutorial(current, actionsFor(current));
    results.push(result);
    current = result.state;
    if (until(result)) {
      break;
    }
  }
  return { state: current, results };
}

function driver(s: TutorialState): SimAction[] {
  const step = currentTutorialStep(s);
  switch (step.id) {
    case 'move':
      return [{ type: 'move', x: 1, z: 0 }];
    case 'sprint':
      return [
        { type: 'move', x: 1, z: 0 },
        { type: 'sprint', held: true },
      ];
    case 'chestPass':
    case 'bouncePass':
    case 'lob':
      return s.game.ball.kind === 'held' ? [{ type: 'pass', passType: step.id, targetId: SG }] : [];
    case 'shoot':
      return [{ type: 'shoot' }];
    case 'floater':
      return [{ type: 'floater' }];
  }
}

function toStep(index: number): TutorialState {
  let state = startTutorial(OPTIONS);
  while (state.stepIndex < index) {
    const from = state.stepIndex;
    state = run(state, driver, 2000, (r) => r.state.stepIndex > from).state;
  }
  return state;
}

describe('tutorial sandbox', () => {
  it('(a) a scripted driver completes all seven steps in order', () => {
    const completed: string[] = [];
    const { state } = run(startTutorial(OPTIONS), driver, 20000, (r) => {
      if (r.completed !== null) {
        completed.push(r.completed);
      }
      return r.state.status === 'finished';
    });
    expect(completed).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    expect(state.status).toBe('finished');
  });

  it.each(TUTORIAL_STEPS.map((s, i) => [s.id, i] as const))(
    '(b) %s stays put with idle actions',
    (_id, index) => {
      const start = toStep(index);
      const { state } = run(start, () => [], 5 * SIM_HZ);
      expect(state.stepIndex).toBe(index);
      expect(state.status).toBe('active');
    },
  );

  it('(c) a bounce pass on the chest pass step rebuilds the step as a miss', () => {
    const start = toStep(2);
    const bounce = (s: TutorialState): SimAction[] =>
      s.game.ball.kind === 'held' ? [{ type: 'pass', passType: 'bouncePass', targetId: SG }] : [];
    const { state, results } = run(start, bounce, 600, (r) => r.reset);
    expect(results[results.length - 1]?.reset).toBe(true);
    expect(state.stepIndex).toBe(2);
    expect(state.status).toBe('active');
    expect(state.misses).toBe(1);
    expect(state.game.ball).toEqual({ kind: 'held', holderId: state.game.controlledPlayerId });
  });

  it('(d) shoot on the floater step does not advance', () => {
    const start = toStep(6);
    const { state } = run(start, () => [{ type: 'shoot' }], 600);
    expect(state.stepIndex).toBe(6);
    expect(state.status).toBe('active');
  });

  it('(e) a floater from beyond range is ignored', () => {
    const start = toStep(6);
    const far = {
      ...start,
      game: {
        ...start.game,
        players: start.game.players.map((p) =>
          p.id === start.game.controlledPlayerId ? { ...p, pos: { x: 0, z: 6 } } : p,
        ),
      },
    };
    const { state } = run(far, () => [{ type: 'floater' }], 300);
    expect(state.status).toBe('active');
    expect(state.stepIndex).toBe(6);
  });

  it('(f) sprinting without moving does not advance the sprint step', () => {
    const start = toStep(1);
    const { state } = run(start, () => [{ type: 'sprint', held: true }], 5 * SIM_HZ);
    expect(state.stepIndex).toBe(1);
    expect(state.status).toBe('active');
  });

  it('(g) finished is sticky', () => {
    const { state } = run(
      startTutorial(OPTIONS),
      driver,
      20000,
      (r) => r.state.status === 'finished',
    );
    const result = stepTutorial(state, [{ type: 'move', x: 1, z: 0 }]);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.reset).toBe(false);
    expect(result.completed).toBeNull();
  });
});
