// Controls tutorial sandbox: a pure, deterministic engine that runs the tutorial steps of
// ../content/tutorial on a bare sim game (decision g6: its own scripted sandbox, not a play and not a
// run). It builds a `createGame` in 'cones' mode per step (cones never intercept, contest or block;
// teammates stand still), steps it with `stepGame`, detects "the action was done" from sim events
// and state, holds briefly on success, then rebuilds the game for the next step.
//
// There is no referee, no outcome and no attempt here, so nothing in this module can reach the
// progress counters (decision g12). It never mutates its inputs and uses no wall clock or
// Math.random.
//
// A wrong attempt does not advance the step. When the ball leaves the human's hands for good (a
// teammate holds it, or the ball is dead), or a `mistake` event fired on the last tick, the step
// rebuilds at its start spot and `misses` goes up by 1.

import { TUTORIAL_STEPS, type TutorialStep, type TutorialStepId } from '../content';
import {
  SIM_HZ,
  createGame,
  stepGame,
  type GameEvent,
  type GameState,
  type MovementSetup,
  type PassingSetup,
  type ShootingSetup,
  type SimAction,
} from '../sim';

export interface TutorialSandboxOptions {
  seed: number;
  movement: MovementSetup;
  passing: PassingSetup;
  shooting: ShootingSetup;
  /** Defaults to TUTORIAL_STEPS. */
  steps?: readonly TutorialStep[];
}

/** Sim steps the success state is shown before the next step starts. */
export const TUTORIAL_STEP_HOLD_STEPS = Math.round(1 * SIM_HZ);
/** Sim steps the closing message is shown before the tutorial ends. */
export const TUTORIAL_FINISH_HOLD_STEPS = Math.round(2 * SIM_HZ);

export type TutorialStatus = 'active' | 'stepDone' | 'finished';

export interface TutorialState {
  options: TutorialSandboxOptions;
  steps: readonly TutorialStep[];
  stepIndex: number;
  /** Counts game rebuilds; added to the seed so each rebuild is deterministic. */
  setupIndex: number;
  game: GameState;
  status: TutorialStatus;
  /** Horizontal distance the controlled player has walked this attempt, m. */
  movedM: number;
  /** Sim steps the controlled player has sprinted this attempt. */
  sprintTicks: number;
  /** Wrong attempts on the current step. */
  misses: number;
  holdStepsLeft: number;
}

export interface TutorialStepResult {
  state: TutorialState;
  events: GameEvent[];
  /** True when the game was rebuilt this call (a miss or the next step). */
  reset: boolean;
  /** The step finished by this call, or null. */
  completed: TutorialStepId | null;
}

const IDLE_ACTIONS: readonly SimAction[] = [
  { type: 'move', x: 0, z: 0 },
  { type: 'sprint', held: false },
];

function buildSetup(
  options: TutorialSandboxOptions,
  step: TutorialStep,
  setupIndex: number,
): GameState {
  const game = createGame({
    seed: (options.seed + setupIndex) >>> 0,
    movement: options.movement,
    passing: options.passing,
    shooting: options.shooting,
    defenseMode: 'cones',
  });
  const players = game.players.map((player) =>
    player.id === game.controlledPlayerId
      ? { ...player, pos: { x: step.start.x, z: step.start.z }, vel: { x: 0, z: 0 } }
      : player,
  );
  return { ...game, players };
}

function stepsOf(options: TutorialSandboxOptions): readonly TutorialStep[] {
  const steps = options.steps ?? TUTORIAL_STEPS;
  if (steps.length === 0) {
    throw new Error('Court Vision: the tutorial needs at least one step');
  }
  return steps;
}

export function startTutorial(options: TutorialSandboxOptions): TutorialState {
  const steps = stepsOf(options);
  return {
    options,
    steps,
    stepIndex: 0,
    setupIndex: 0,
    game: buildSetup(options, steps[0] as TutorialStep, 0),
    status: 'active',
    movedM: 0,
    sprintTicks: 0,
    misses: 0,
    holdStepsLeft: 0,
  };
}

export function currentTutorialStep(state: TutorialState): TutorialStep {
  return state.steps[state.stepIndex] as TutorialStep;
}

function needsReset(game: GameState): boolean {
  if (game.ball.kind === 'dead') {
    return true;
  }
  if (game.ball.kind === 'held' && game.ball.holderId !== game.controlledPlayerId) {
    return true;
  }
  return game.events.some((event) => event.type === 'mistake');
}

function controlled(game: GameState) {
  const player = game.players.find((p) => p.id === game.controlledPlayerId);
  if (player === undefined) {
    throw new Error('Court Vision: the controlled player is missing');
  }
  return player;
}

function goalMet(step: TutorialStep, state: TutorialState, events: readonly GameEvent[]): boolean {
  const goal = step.goal;
  const id = state.game.controlledPlayerId;
  switch (goal.kind) {
    case 'move':
      return state.movedM >= goal.distanceM;
    case 'sprint':
      return state.sprintTicks >= Math.round(goal.seconds * SIM_HZ);
    case 'pass':
      return events.some(
        (e) => e.type === 'passCompleted' && e.passType === goal.passType && e.passerId === id,
      );
    case 'shot':
      return events.some(
        (e) =>
          e.type === 'shotResolved' &&
          e.shooterId === id &&
          (e.shotType === 'floater') === goal.floater,
      );
  }
}

export function stepTutorial(
  state: TutorialState,
  actions: readonly SimAction[],
): TutorialStepResult {
  if (state.status === 'finished') {
    return { state, events: [], reset: false, completed: null };
  }

  if (state.status === 'stepDone') {
    const game = stepGame(state.game, IDLE_ACTIONS);
    const holdStepsLeft = state.holdStepsLeft - 1;
    if (holdStepsLeft > 0) {
      return {
        state: { ...state, game, holdStepsLeft },
        events: game.events,
        reset: false,
        completed: null,
      };
    }
    if (state.stepIndex >= state.steps.length - 1) {
      return {
        state: { ...state, game, holdStepsLeft: 0, status: 'finished' },
        events: game.events,
        reset: false,
        completed: null,
      };
    }
    const stepIndex = state.stepIndex + 1;
    const setupIndex = state.setupIndex + 1;
    return {
      state: {
        ...state,
        stepIndex,
        setupIndex,
        game: buildSetup(state.options, state.steps[stepIndex] as TutorialStep, setupIndex),
        status: 'active',
        movedM: 0,
        sprintTicks: 0,
        misses: 0,
        holdStepsLeft: 0,
      },
      events: [],
      reset: true,
      completed: null,
    };
  }

  const step = currentTutorialStep(state);
  if (needsReset(state.game)) {
    const setupIndex = state.setupIndex + 1;
    return {
      state: {
        ...state,
        setupIndex,
        game: buildSetup(state.options, step, setupIndex),
        movedM: 0,
        sprintTicks: 0,
        misses: state.misses + 1,
      },
      events: [],
      reset: true,
      completed: null,
    };
  }

  const before = controlled(state.game).pos;
  const game = stepGame(state.game, actions);
  const after = controlled(game);
  const next: TutorialState = {
    ...state,
    game,
    movedM: state.movedM + Math.hypot(after.pos.x - before.x, after.pos.z - before.z),
    sprintTicks: state.sprintTicks + (after.sprinting ? 1 : 0),
  };
  if (!goalMet(step, next, game.events)) {
    return { state: next, events: game.events, reset: false, completed: null };
  }
  const last = state.stepIndex >= state.steps.length - 1;
  return {
    state: {
      ...next,
      status: 'stepDone',
      holdStepsLeft: last ? TUTORIAL_FINISH_HOLD_STEPS : TUTORIAL_STEP_HOLD_STEPS,
    },
    events: game.events,
    reset: false,
    completed: step.id,
  };
}
