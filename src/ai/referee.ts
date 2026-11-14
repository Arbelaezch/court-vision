// Run referee: decides each run's outcome per mode (Practice, Scrimmage). It is stepped next to the
// run engine (stepPracticeRun today, the Scrimmage driver later) and is the only producer of
// `runSuccess` and `runUnsuccessful`.
//
// Rules (see .factory/decisions.md):
// - g1 and "Practice standard coverage per play": Practice grades against `play.practiceCoverage`
//   and has no look grading. The standard path is the coverage's best (`great`) read at each
//   decision; a shot on that path succeeds made or missed.
// - g2: only a wrong teammate or a turnover resets with a whistle (`mistake`). In Scrimmage a Good
//   read continues and the run counts as a success, shown as Good rather than Perfect.
// - g3: strict in both modes. An off-script action or a pass to the wrong teammate is a mistake.
//   The "suboptimal read continues" exception is Scrimmage only.
// - g5: interceptions, out of bounds, shot-clock violations and blocked shots are turnovers.
// - "Bad look or blocked on-script shot": a blocked shot is a turnover; a Bad look is an
//   unsuccessful run, with no whistle and no reset.
//
// Blocked shots, interceptions and out of bounds are sim turnovers (src/sim/takeShot.ts,
// src/sim/passing.ts, src/sim/step.ts). The referee records them as the outcome but does not
// re-emit the `mistake` event the sim already emitted.
//
// OUTCOME_RULES is the single place where mode-dependent outcomes live: each entry is a one-line
// change between 'mistake' (whistle, reset) and 'unsuccessful' (no whistle, no reset).
//
// A run ends on the first of: an unblocked human shot resolving, the human's final-decision pass
// completing, any mistake, or a rule outcome of 'unsuccessful'. After that the referee ignores the
// rest of the run, so a later interception of a wrong-teammate pass is not a second outcome.
//
// Pure and deterministic: no mutation of inputs, no Math.random, no wall clock.
import type { DecisionGrade, PlayScenario } from '../content';
import type { GameEvent, GameState, MistakeKind, RoleId, RunGrade, SimAction } from '../sim';
import {
  GRADE_REASONS,
  MISTAKE_REASONS,
  classifyAction,
  findDecisionPoint,
  type ResolvingAction,
} from './grading';

export type RunMode = 'practice' | 'scrimmage';
export type RunQuality = 'great' | 'good';
export type OutcomeRule = 'mistake' | 'unsuccessful';

export const OUTCOME_RULES = {
  // "Bad look or blocked on-script shot": a Bad look in Scrimmage is an unsuccessful run.
  badLook: 'unsuccessful',
  // g2 + "Bad look or blocked on-script shot": a Bad-graded listed read ends the run, no reset.
  badRead: 'unsuccessful',
  // g3: in Practice any read but the standard (great) one is off script.
  practiceOffPath: 'mistake',
} as const satisfies Record<string, OutcomeRule>;

export interface GradedDecision {
  tick: number;
  decisionId: string;
  optionId: string;
  grade: DecisionGrade;
  reason: string;
}

export type RunOutcome =
  | { kind: 'success'; tick: number; quality: RunQuality }
  | { kind: 'unsuccessful'; tick: number; reason: string }
  | { kind: 'mistake'; tick: number; mistakeKind: MistakeKind; reason: string };

export interface RefereeState {
  playId: string;
  mode: RunMode;
  coverageId: string;
  humanRole: RoleId;
  graded: GradedDecision[];
  /** Receiver player id of the human's final-decision pass in flight, or null. */
  pendingFinalPassTo: number | null;
  outcome: RunOutcome | null;
}

export interface RefereeOptions {
  mode: RunMode;
  humanRole: RoleId;
  coverageId?: string;
}

/** Event grade for a run quality: great -> 'perfect', good -> 'good'. */
export function runGradeFor(quality: RunQuality): RunGrade {
  return quality === 'great' ? 'perfect' : 'good';
}

export function startReferee(play: PlayScenario, options: RefereeOptions): RefereeState {
  const { mode, humanRole } = options;
  if (!play.playableRoles.includes(humanRole)) {
    throw new Error(
      `Court Vision: humanRole must be one of ${play.playableRoles.join(', ')} for play ${play.id}, got ${String(humanRole)}`,
    );
  }
  let coverageId: string;
  if (mode === 'practice') {
    coverageId = options.coverageId ?? play.practiceCoverage;
    if (coverageId !== play.practiceCoverage) {
      throw new Error(
        `Court Vision: Practice uses coverage ${play.practiceCoverage}, got ${coverageId}`,
      );
    }
  } else if (mode === 'scrimmage') {
    if (options.coverageId === undefined) {
      throw new Error(`Court Vision: Scrimmage needs a coverageId for play ${play.id}`);
    }
    coverageId = options.coverageId;
    if (!play.coverages.some((c) => c.id === coverageId)) {
      throw new Error(`Court Vision: play ${play.id} has no coverage ${coverageId}`);
    }
  } else {
    throw new Error(`Court Vision: unknown run mode ${String(mode)}`);
  }
  return {
    playId: play.id,
    mode,
    coverageId,
    humanRole,
    graded: [],
    pendingFinalPassTo: null,
    outcome: null,
  };
}

function holds(game: GameState, playerId: number): boolean {
  return game.ball.kind === 'held' && game.ball.holderId === playerId;
}

/**
 * The first human action in `actions` that took effect this step: a pass counts when the human held
 * the ball before and not after; a shoot or floater counts when the human's shot resolved.
 */
function countedAction(
  actions: readonly SimAction[],
  before: GameState,
  after: GameState,
  humanId: number,
): ResolvingAction | null {
  for (const action of actions) {
    if (action.type === 'pass') {
      if (holds(before, humanId) && !holds(after, humanId)) return action;
    } else if (action.type === 'shoot' || action.type === 'floater') {
      if (after.events.some((e) => e.type === 'shotResolved' && e.shooterId === humanId)) {
        return action;
      }
    }
  }
  return null;
}

/** Role of the offense player `id`; null when missing, on defense, or the human itself. */
function teammateRole(game: GameState, id: number, humanId: number): RoleId | null {
  if (id === humanId) return null;
  const player = game.players.find((p) => p.id === id);
  return player !== undefined && player.side === 'offense' ? player.role : null;
}

/** Whether the play has a decision for `role` in a phase after `phaseId`. */
function hasLaterDecision(play: PlayScenario, role: RoleId, phaseId: string): boolean {
  const index = play.phases.findIndex((p) => p.id === phaseId);
  return play.phases.some((p, i) => i > index && findDecisionPoint(play, role, p.id) !== null);
}

function successQuality(mode: RunMode, graded: readonly GradedDecision[]): RunQuality {
  if (mode === 'practice') return 'great';
  return graded.some((g) => g.grade === 'good') ? 'good' : 'great';
}

type StepResult = { referee: RefereeState; events: GameEvent[]; resetRequested: boolean };

function applyRule(
  referee: RefereeState,
  rule: OutcomeRule,
  tick: number,
  reason: string,
): StepResult {
  if (rule === 'mistake') {
    return {
      referee: { ...referee, outcome: { kind: 'mistake', tick, mistakeKind: 'offScript', reason } },
      events: [{ type: 'mistake', tick, kind: 'offScript', reason }],
      resetRequested: true,
    };
  }
  return {
    referee: { ...referee, outcome: { kind: 'unsuccessful', tick, reason } },
    events: [{ type: 'runUnsuccessful', tick, reason }],
    resetRequested: false,
  };
}

/**
 * Advances the referee by one run step. `phaseId` is the run's phase before the step and `after`
 * is the state the step produced. Pure: returns a new referee and the events it emits.
 */
export function stepReferee(
  play: PlayScenario,
  referee: RefereeState,
  step: { before: GameState; phaseId: string; actions: readonly SimAction[]; after: GameState },
): StepResult {
  if (play.id !== referee.playId) {
    throw new Error(`Court Vision: referee is for play ${referee.playId}, got play ${play.id}`);
  }
  if (referee.outcome !== null) return { referee, events: [], resetRequested: false };

  const { before, phaseId, actions, after } = step;
  const tick = before.tick + 1;
  const humanId = before.controlledPlayerId;
  let graded = referee.graded;
  let pendingFinalPassTo = referee.pendingFinalPassTo;

  // 1-3. Grade the human's resolving action, if one took effect.
  const action = countedAction(actions, before, after, humanId);
  if (action !== null) {
    const targetRole =
      action.type === 'pass' ? teammateRole(before, action.targetId, humanId) : null;
    const cls = classifyAction(play, {
      role: referee.humanRole,
      phaseId,
      coverageId: referee.coverageId,
      action,
      targetRole,
    });
    if (cls.kind === 'wrongTeammate' || cls.kind === 'offScript') {
      return {
        referee: {
          ...referee,
          outcome: { kind: 'mistake', tick, mistakeKind: cls.kind, reason: cls.reason },
        },
        events: [{ type: 'mistake', tick, kind: cls.kind, reason: cls.reason }],
        resetRequested: true,
      };
    }
    if (cls.kind === 'option') {
      if (referee.mode === 'practice' && cls.grade !== 'great') {
        return applyRule(
          referee,
          OUTCOME_RULES.practiceOffPath,
          tick,
          MISTAKE_REASONS.notThePlaysRead,
        );
      }
      if (referee.mode === 'scrimmage' && cls.grade === 'bad') {
        return applyRule(referee, OUTCOME_RULES.badRead, tick, GRADE_REASONS.bad);
      }
      const { decisionId, optionId, grade, reason } = cls;
      graded = [...graded, { tick, decisionId, optionId, grade, reason }];
      if (action.type === 'pass' && !hasLaterDecision(play, referee.humanRole, phaseId)) {
        pendingFinalPassTo = action.targetId;
      }
    }
  }
  const updated: RefereeState = { ...referee, graded, pendingFinalPassTo };

  // 4. Sim turnovers: the sim already emitted the mistake, so record it and request the reset.
  const turnover = after.events.find((e) => e.type === 'mistake');
  if (turnover !== undefined) {
    return {
      referee: {
        ...updated,
        outcome: {
          kind: 'mistake',
          tick: turnover.tick,
          mistakeKind: turnover.kind,
          reason: turnover.reason,
        },
      },
      events: [],
      resetRequested: true,
    };
  }

  // 5. End of run: an unblocked human shot, or the final-decision pass completing.
  const shot = after.events.find(
    (e) => e.type === 'shotResolved' && e.shooterId === humanId && e.blockerId === null,
  );
  if (shot !== undefined && shot.type === 'shotResolved') {
    if (updated.mode === 'scrimmage' && shot.look === 'bad') {
      return applyRule(updated, OUTCOME_RULES.badLook, tick, shot.reason);
    }
    return succeed(updated, tick);
  }
  const finalCatch = after.events.some(
    (e) =>
      e.type === 'passCompleted' &&
      e.passerId === humanId &&
      pendingFinalPassTo !== null &&
      e.receiverId === pendingFinalPassTo,
  );
  if (finalCatch) return succeed(updated, tick);

  return { referee: updated, events: [], resetRequested: false };
}

function succeed(referee: RefereeState, tick: number): StepResult {
  const quality = successQuality(referee.mode, referee.graded);
  return {
    referee: { ...referee, outcome: { kind: 'success', tick, quality } },
    events: [{ type: 'runSuccess', tick, grade: runGradeFor(quality) }],
    resetRequested: false,
  };
}
