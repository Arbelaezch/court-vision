// Grading of one resolving human action at a decision point. Pure: no state, no mode, no clock.
//
// Rules (see .factory/decisions.md):
// - g2: a wrong teammate (a pass to someone the play does not read) is a mistake.
// - g3: a listed option is graded per coverage (great / good / bad); an action that matches no
//   option is off script.
// - "Practice standard coverage per play": Practice grades against `play.practiceCoverage`, so the
//   caller passes that coverage id; this module only looks the grade up.
//
// Matching:
// - A pass first matches an option with the same pass type and target, then the first option with
//   the same target and any pass move (the read is graded, the pass type only changes risk). Failing
//   that it is on path (ungraded) when the phase expects a pass to that target or the role's track
//   passes to it in that phase; otherwise it is a wrong teammate.
// - A shoot or floater matches an option with the same move, then the first shoot/floater option,
//   else it is off script.
// - Movement is never graded.
import { PASS_MOVES } from '../content';
import type { DecisionGrade, DecisionOption, DecisionPoint, PlayScenario } from '../content';
import type { RoleId, SimAction } from '../sim';

export const MISTAKE_REASONS = {
  wrongTeammate: 'Wrong teammate',
  offScript: 'Off script',
  notThePlaysRead: "Not the play's read",
} as const;

export const GRADE_REASONS = {
  great: 'Best read for this coverage',
  good: 'Good read, but not the best one',
  bad: 'Bad read for this coverage',
} as const satisfies Record<DecisionGrade, string>;

export type ResolvingAction = Extract<SimAction, { type: 'pass' | 'shoot' | 'floater' }>;

export type ActionClass =
  | { kind: 'option'; decisionId: string; optionId: string; grade: DecisionGrade; reason: string }
  | { kind: 'onPath' }
  | { kind: 'wrongTeammate'; reason: string }
  | { kind: 'offScript'; reason: string };

/** The first decision of `role` in `phaseId`, or null. */
export function findDecisionPoint(
  play: PlayScenario,
  role: RoleId,
  phaseId: string,
): DecisionPoint | null {
  return play.decisions.find((d) => d.role === role && d.phase === phaseId) ?? null;
}

function optionClass(
  play: PlayScenario,
  decision: DecisionPoint,
  option: DecisionOption,
  coverageId: string,
): ActionClass {
  const grade = option.grades[coverageId];
  if (grade === undefined) {
    throw new Error(
      `Court Vision: play ${play.id} has no coverage ${coverageId} in option ${option.id}`,
    );
  }
  return {
    kind: 'option',
    decisionId: decision.id,
    optionId: option.id,
    grade,
    reason: GRADE_REASONS[grade],
  };
}

function isOnPathPass(
  play: PlayScenario,
  role: RoleId,
  phaseId: string,
  targetRole: RoleId,
): boolean {
  const phase = play.phases.find((p) => p.id === phaseId);
  const triggered = phase?.transitions.some(
    (t) =>
      t.trigger.kind === 'passCompleted' && t.trigger.from === role && t.trigger.to === targetRole,
  );
  if (triggered) return true;
  return play.tracks[role].some(
    (s) =>
      s.phase === phaseId &&
      (s.action === 'pass' || s.action === 'handOff') &&
      s.target === targetRole,
  );
}

export function classifyAction(
  play: PlayScenario,
  input: {
    role: RoleId;
    phaseId: string;
    coverageId: string;
    action: ResolvingAction;
    targetRole: RoleId | null;
  },
): ActionClass {
  const { role, phaseId, coverageId, action, targetRole } = input;
  const decision = findDecisionPoint(play, role, phaseId);
  const options = decision?.options ?? [];

  if (action.type === 'pass') {
    if (targetRole === null) {
      return { kind: 'wrongTeammate', reason: MISTAKE_REASONS.wrongTeammate };
    }
    const match =
      options.find((o) => o.move === action.passType && o.target === targetRole) ??
      options.find((o) => o.target === targetRole && PASS_MOVES.includes(o.move));
    if (decision && match) return optionClass(play, decision, match, coverageId);
    if (isOnPathPass(play, role, phaseId, targetRole)) return { kind: 'onPath' };
    return { kind: 'wrongTeammate', reason: MISTAKE_REASONS.wrongTeammate };
  }

  const match =
    options.find((o) => o.move === action.type) ??
    options.find((o) => o.move === 'shoot' || o.move === 'floater');
  if (decision && match) return optionClass(play, decision, match, coverageId);
  return { kind: 'offScript', reason: MISTAKE_REASONS.offScript };
}
