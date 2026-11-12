// Play schema and reader. A play is one scenario kind (see scenarios.ts): setup positions, a
// play-level phase graph with cues, a scripted track per offensive role, defensive coverages
// with per-phase defender placements, and graded decision points for the playable role.
//
// Validation is fail-fast and runs in this order (tests depend on it):
//   a. unknown play keys, id, kind, name, blurb, concept, difficulty
//   b. playableRoles
//   c. setup (positions, ballHolder)
//   d. phases: ids first, then transitions and cues per phase, then a reachable terminal phase
//   e. tracks
//   f. coverages: count >= 2, each coverage, then exactly one practiceStandard
//   g. decisions: role, phase (known, reachable), options, a great option per coverage
//   h. at least one decision per playable role
// Every field path is rooted at the play id (e.g. giveAndGo.tracks.SF), so errors name the play.

import { BASELINE_Z, HALF_COURT_LINE_Z, ROLE_ORDER, SIDELINE_X } from '../sim';
import type { CourtPoint, RoleId } from '../sim';
import { MOVE_IDS, type MoveId, type RoleTable } from './roles';
import {
  childPath,
  fail,
  getField,
  readArray,
  readBoolean,
  readEnum,
  readId,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  type FieldPath,
} from './validate';

export const CUE_LEVELS = ['full', 'reduced', 'none'] as const;
export type CueLevel = (typeof CUE_LEVELS)[number];

export const CUE_KINDS = ['floorArrow', 'targetRing', 'spotMarker', 'prompt'] as const;
export type CueKind = (typeof CUE_KINDS)[number];

export const TRIGGER_KINDS = [
  'reachedSpot',
  'passCompleted',
  'screenSet',
  'timeElapsed',
  'defenseReaction',
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const TRACK_ACTIONS = [
  'hold',
  'moveTo',
  'cut',
  'space',
  'drive',
  'setScreen',
  'useScreen',
  'handOff',
  'pass',
  'receive',
  'shoot',
] as const;
export type TrackAction = (typeof TRACK_ACTIONS)[number];

/** Track actions that act on a teammate and so require `target`. */
export const TARGETED_TRACK_ACTIONS = ['setScreen', 'useScreen', 'handOff', 'pass'] as const;

export const DEFENDER_ACTIONS = [
  'guard',
  'sag',
  'help',
  'closeout',
  'chaseOver',
  'goUnder',
  'switch',
  'drop',
  'hedge',
  'recover',
] as const;
export type DefenderAction = (typeof DEFENDER_ACTIONS)[number];

export const DECISION_GRADES = ['great', 'good', 'bad'] as const;
export type DecisionGrade = (typeof DECISION_GRADES)[number];

/** Moves that send the ball to a teammate and so require `target`. */
export const PASS_MOVES: readonly MoveId[] = ['chestPass', 'bouncePass', 'lob', 'handOff'];

export type Cue =
  | { readonly kind: 'floorArrow'; readonly to: CourtPoint }
  | { readonly kind: 'targetRing'; readonly role: RoleId }
  | { readonly kind: 'spotMarker'; readonly spot: CourtPoint }
  | { readonly kind: 'prompt'; readonly text: string };

/** Cues shown per cue level. The `none` level is always empty. */
export type PhaseCues = Readonly<Record<CueLevel, readonly Cue[]>>;

export type PhaseTrigger =
  | { readonly kind: 'reachedSpot'; readonly role: RoleId; readonly spot: CourtPoint }
  | { readonly kind: 'passCompleted'; readonly from: RoleId; readonly to: RoleId }
  | { readonly kind: 'screenSet'; readonly screener: RoleId }
  | { readonly kind: 'timeElapsed'; readonly seconds: number }
  | { readonly kind: 'defenseReaction'; readonly defender: RoleId; readonly action: DefenderAction };

export interface PhaseTransition {
  readonly to: string;
  readonly trigger: PhaseTrigger;
}

/** A play-level phase. `phases[0]` is the start phase; a phase with no transitions is terminal. */
export interface Phase {
  readonly id: string;
  readonly transitions: readonly PhaseTransition[];
  readonly cues: PhaseCues;
}

/**
 * One scripted step of an offensive role's track. Screens and handoffs are track actions the
 * play triggers automatically (`setScreen`, `useScreen`, `handOff`); the user never calls them
 * in v1. `target` is present exactly when the action is in TARGETED_TRACK_ACTIONS.
 */
export interface TrackStep {
  readonly phase: string;
  readonly action: TrackAction;
  readonly spot: CourtPoint;
  readonly target?: RoleId;
}

export interface DefenderStep {
  readonly spot: CourtPoint;
  readonly action: DefenderAction;
}

/** Defender placements for a phase, keyed by the offensive role each defender guards at setup. */
export interface CoverageStep {
  readonly phase: string;
  readonly defenders: Readonly<Record<RoleId, DefenderStep>>;
}

/**
 * A defensive look. Phases not listed in `script` keep the previous placements. The Practice
 * standard coverage's script is also where the Practice cones go.
 */
export interface Coverage {
  readonly id: string;
  readonly name: string;
  readonly practiceStandard: boolean;
  readonly script: readonly CoverageStep[];
}

/**
 * An on-script option at a decision point, graded per coverage id. Any action not listed as an
 * option is off-script, which is a Bad outcome and resets the run. `target` is present exactly
 * when the move is in PASS_MOVES.
 */
export interface DecisionOption {
  readonly id: string;
  readonly move: MoveId;
  readonly target?: RoleId;
  readonly grades: Readonly<Record<string, DecisionGrade>>;
}

/**
 * A read the playable role makes in a phase. Only the listed options are on-script; anything
 * else the user does there is off-script (Bad, reset with whistle).
 */
export interface DecisionPoint {
  readonly id: string;
  readonly role: RoleId;
  readonly phase: string;
  readonly options: readonly DecisionOption[];
}

export interface PlaySetup {
  readonly positions: Readonly<Record<RoleId, CourtPoint>>;
  readonly ballHolder: RoleId;
}

export interface PlayScenario {
  readonly kind: 'play';
  readonly id: string;
  readonly name: string;
  /** Integer >= 1; 1 is the easiest. */
  readonly difficulty: number;
  readonly blurb: string;
  readonly concept: string;
  readonly playableRoles: readonly RoleId[];
  readonly setup: PlaySetup;
  readonly phases: readonly Phase[];
  readonly tracks: Readonly<Record<RoleId, readonly TrackStep[]>>;
  readonly coverages: readonly Coverage[];
  /** Id of the single coverage marked `practiceStandard: true` (derived, not a data key). */
  readonly practiceCoverage: string;
  readonly decisions: readonly DecisionPoint[];
}

const PLAY_KEYS = [
  'kind',
  'id',
  'name',
  'difficulty',
  'blurb',
  'concept',
  'playableRoles',
  'setup',
  'phases',
  'tracks',
  'coverages',
  'decisions',
] as const;
const PLAY_KIND = ['play'] as const;
const POINT_KEYS = ['x', 'z'] as const;
const SETUP_KEYS = ['positions', 'ballHolder'] as const;
const PHASE_KEYS = ['id', 'transitions', 'cues'] as const;
const TRANSITION_KEYS = ['to', 'trigger'] as const;
const TRACK_STEP_KEYS = ['phase', 'action', 'spot', 'target'] as const;
const COVERAGE_KEYS = ['id', 'name', 'practiceStandard', 'script'] as const;
const COVERAGE_STEP_KEYS = ['phase', 'defenders'] as const;
const DEFENDER_STEP_KEYS = ['spot', 'action'] as const;
const DECISION_KEYS = ['id', 'role', 'phase', 'options'] as const;
const OPTION_KEYS = ['id', 'move', 'target', 'grades'] as const;

const TRIGGER_KEYS: Readonly<Record<TriggerKind, readonly string[]>> = {
  reachedSpot: ['kind', 'role', 'spot'],
  passCompleted: ['kind', 'from', 'to'],
  screenSet: ['kind', 'screener'],
  timeElapsed: ['kind', 'seconds'],
  defenseReaction: ['kind', 'defender', 'action'],
};

const CUE_KEYS: Readonly<Record<CueKind, readonly string[]>> = {
  floorArrow: ['kind', 'to'],
  targetRing: ['kind', 'role'],
  spotMarker: ['kind', 'spot'],
  prompt: ['kind', 'text'],
};

function readCourtPoint(value: unknown, at: FieldPath): CourtPoint {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, POINT_KEYS, at);
  const xField = getField(obj, 'x', at);
  const x = readNumber(xField.value, xField.at, { min: -SIDELINE_X, max: SIDELINE_X });
  const zField = getField(obj, 'z', at);
  const z = readNumber(zField.value, zField.at, { min: BASELINE_Z, max: HALF_COURT_LINE_Z });
  return { x, z };
}

function readRole(value: unknown, at: FieldPath): RoleId {
  return readEnum(value, ROLE_ORDER, at);
}

function readRoleRecord<T>(
  value: unknown,
  at: FieldPath,
  readItem: (item: unknown, itemAt: FieldPath, role: RoleId) => T,
): Record<RoleId, T> {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, ROLE_ORDER, at);
  const out: Partial<Record<RoleId, T>> = {};
  for (const role of ROLE_ORDER) {
    const field = getField(obj, role, at);
    out[role] = readItem(field.value, field.at, role);
  }
  return out as Record<RoleId, T>;
}

function readPhaseRef(value: unknown, at: FieldPath, phaseIds: ReadonlySet<string>): string {
  const phase = readString(value, at);
  if (!phaseIds.has(phase)) fail(at, `unknown phase "${phase}"`);
  return phase;
}

function readNonEmptyArray(value: unknown, at: FieldPath, what: string): unknown[] {
  const items = readArray(value, at);
  if (items.length === 0) fail(at, `expected at least one ${what}`);
  return items;
}

function hasValue(obj: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(obj, key) && obj[key] !== undefined;
}

function readTrigger(value: unknown, at: FieldPath): PhaseTrigger {
  const obj = readObject(value, at);
  const kindField = getField(obj, 'kind', at);
  const kind = readEnum(kindField.value, TRIGGER_KINDS, kindField.at);
  rejectUnknownKeys(obj, TRIGGER_KEYS[kind], at);
  const role = (key: string) => {
    const f = getField(obj, key, at);
    return readRole(f.value, f.at);
  };
  switch (kind) {
    case 'reachedSpot': {
      const spotField = getField(obj, 'spot', at);
      return { kind, role: role('role'), spot: readCourtPoint(spotField.value, spotField.at) };
    }
    case 'passCompleted': {
      const from = role('from');
      const to = role('to');
      if (from === to) fail(childPath(at, 'to'), `expected a different role than from "${from}"`);
      return { kind, from, to };
    }
    case 'screenSet':
      return { kind, screener: role('screener') };
    case 'timeElapsed': {
      const f = getField(obj, 'seconds', at);
      return { kind, seconds: readNumber(f.value, f.at, { min: 0.1, max: 24 }) };
    }
    case 'defenseReaction': {
      const defender = role('defender');
      const f = getField(obj, 'action', at);
      return { kind, defender, action: readEnum(f.value, DEFENDER_ACTIONS, f.at) };
    }
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function readCue(value: unknown, at: FieldPath): Cue {
  const obj = readObject(value, at);
  const kindField = getField(obj, 'kind', at);
  const kind = readEnum(kindField.value, CUE_KINDS, kindField.at);
  rejectUnknownKeys(obj, CUE_KEYS[kind], at);
  switch (kind) {
    case 'floorArrow': {
      const f = getField(obj, 'to', at);
      return { kind, to: readCourtPoint(f.value, f.at) };
    }
    case 'targetRing': {
      const f = getField(obj, 'role', at);
      return { kind, role: readRole(f.value, f.at) };
    }
    case 'spotMarker': {
      const f = getField(obj, 'spot', at);
      return { kind, spot: readCourtPoint(f.value, f.at) };
    }
    case 'prompt': {
      const f = getField(obj, 'text', at);
      return { kind, text: readString(f.value, f.at) };
    }
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function readCues(value: unknown, at: FieldPath): PhaseCues {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, CUE_LEVELS, at);
  const out: Partial<Record<CueLevel, readonly Cue[]>> = {};
  for (const level of CUE_LEVELS) {
    const field = getField(obj, level, at);
    const items = readArray(field.value, field.at);
    if (level === 'none' && items.length > 0) {
      fail(field.at, 'expected no cues at cue level none');
    }
    out[level] = items.map((item, i) => readCue(item, childPath(field.at, i)));
  }
  return out as PhaseCues;
}

function readPhases(value: unknown, at: FieldPath): Phase[] {
  const rawPhases = readNonEmptyArray(value, at, 'phase');
  const entries = rawPhases.map((raw, i) => {
    const phaseAt = childPath(at, i);
    const obj = readObject(raw, phaseAt);
    rejectUnknownKeys(obj, PHASE_KEYS, phaseAt);
    return { obj, at: phaseAt };
  });

  const phaseIds = new Set<string>();
  const ids = entries.map(({ obj, at: phaseAt }) => {
    const idField = getField(obj, 'id', phaseAt);
    const id = readId(idField.value, idField.at);
    if (phaseIds.has(id)) fail(idField.at, `duplicate phase id "${id}"`);
    phaseIds.add(id);
    return id;
  });

  return entries.map(({ obj, at: phaseAt }, i) => {
    const transField = getField(obj, 'transitions', phaseAt);
    const transitions = readArray(transField.value, transField.at).map((raw, j) => {
      const tAt = childPath(transField.at, j);
      const tObj = readObject(raw, tAt);
      rejectUnknownKeys(tObj, TRANSITION_KEYS, tAt);
      const toField = getField(tObj, 'to', tAt);
      const to = readPhaseRef(toField.value, toField.at, phaseIds);
      const triggerField = getField(tObj, 'trigger', tAt);
      const trigger = readTrigger(triggerField.value, triggerField.at);
      return { to, trigger };
    });
    const cuesField = getField(obj, 'cues', phaseAt);
    const cues = readCues(cuesField.value, cuesField.at);
    return { id: ids[i] as string, transitions, cues };
  });
}

function reachablePhases(phases: readonly Phase[]): Set<string> {
  const byId = new Map(phases.map((p) => [p.id, p]));
  const start = phases[0];
  const reached = new Set<string>();
  if (start === undefined) return reached;
  const queue = [start.id];
  reached.add(start.id);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const t of byId.get(id)?.transitions ?? []) {
      if (!reached.has(t.to)) {
        reached.add(t.to);
        queue.push(t.to);
      }
    }
  }
  return reached;
}

function readTrackStep(
  value: unknown,
  at: FieldPath,
  role: RoleId,
  phaseIds: ReadonlySet<string>,
): TrackStep {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, TRACK_STEP_KEYS, at);
  const phaseField = getField(obj, 'phase', at);
  const phase = readPhaseRef(phaseField.value, phaseField.at, phaseIds);
  const actionField = getField(obj, 'action', at);
  const action = readEnum(actionField.value, TRACK_ACTIONS, actionField.at);
  const spotField = getField(obj, 'spot', at);
  const spot = readCourtPoint(spotField.value, spotField.at);
  if ((TARGETED_TRACK_ACTIONS as readonly TrackAction[]).includes(action)) {
    const targetField = getField(obj, 'target', at);
    const target = readRole(targetField.value, targetField.at);
    if (target === role) fail(targetField.at, `expected a teammate of ${role}, got "${target}"`);
    return { phase, action, spot, target };
  }
  if (hasValue(obj, 'target')) {
    fail(childPath(at, 'target'), `unexpected field for action "${action}"`);
  }
  return { phase, action, spot };
}

function readTracks(
  value: unknown,
  at: FieldPath,
  phaseIds: ReadonlySet<string>,
): Record<RoleId, readonly TrackStep[]> {
  return readRoleRecord(value, at, (raw, trackAt, role) => {
    const seen = new Set<string>();
    return readNonEmptyArray(raw, trackAt, 'track step').map((item, i) => {
      const step = readTrackStep(item, childPath(trackAt, i), role, phaseIds);
      if (seen.has(step.phase)) {
        fail(childPath(childPath(trackAt, i), 'phase'), `duplicate phase "${step.phase}"`);
      }
      seen.add(step.phase);
      return step;
    });
  });
}

function readDefenderStep(value: unknown, at: FieldPath): DefenderStep {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, DEFENDER_STEP_KEYS, at);
  const spotField = getField(obj, 'spot', at);
  const spot = readCourtPoint(spotField.value, spotField.at);
  const actionField = getField(obj, 'action', at);
  const action = readEnum(actionField.value, DEFENDER_ACTIONS, actionField.at);
  return { spot, action };
}

function readCoverages(
  value: unknown,
  at: FieldPath,
  phaseIds: ReadonlySet<string>,
  startPhase: string,
): { coverages: Coverage[]; practiceCoverage: string } {
  const raw = readArray(value, at);
  if (raw.length < 2) fail(at, `expected at least two coverages, got ${raw.length}`);

  const coverageIds = new Set<string>();
  const coverages = raw.map((item, i): Coverage => {
    const covAt = childPath(at, i);
    const obj = readObject(item, covAt);
    rejectUnknownKeys(obj, COVERAGE_KEYS, covAt);

    const idField = getField(obj, 'id', covAt);
    const id = readId(idField.value, idField.at);
    if (coverageIds.has(id)) fail(idField.at, `duplicate coverage id "${id}"`);
    coverageIds.add(id);

    const nameField = getField(obj, 'name', covAt);
    const name = readString(nameField.value, nameField.at);
    const psField = getField(obj, 'practiceStandard', covAt);
    const practiceStandard = readBoolean(psField.value, psField.at);

    const scriptField = getField(obj, 'script', covAt);
    const seen = new Set<string>();
    const script = readNonEmptyArray(scriptField.value, scriptField.at, 'script step').map(
      (rawStep, j): CoverageStep => {
        const stepAt = childPath(scriptField.at, j);
        const stepObj = readObject(rawStep, stepAt);
        rejectUnknownKeys(stepObj, COVERAGE_STEP_KEYS, stepAt);
        const phaseField = getField(stepObj, 'phase', stepAt);
        const phase = readPhaseRef(phaseField.value, phaseField.at, phaseIds);
        if (j === 0 && phase !== startPhase) {
          fail(phaseField.at, `expected first script step to be start phase "${startPhase}"`);
        }
        if (seen.has(phase)) fail(phaseField.at, `duplicate phase "${phase}"`);
        seen.add(phase);
        const defField = getField(stepObj, 'defenders', stepAt);
        const defenders = readRoleRecord(defField.value, defField.at, readDefenderStep);
        return { phase, defenders };
      },
    );
    return { id, name, practiceStandard, script };
  });

  const standards = coverages.filter((c) => c.practiceStandard);
  const standard = standards[0];
  if (standards.length !== 1 || standard === undefined) {
    return fail(
      at,
      `expected exactly one coverage with practiceStandard: true, got ${standards.length}`,
    );
  }
  return { coverages, practiceCoverage: standard.id };
}

function readOption(
  value: unknown,
  at: FieldPath,
  role: RoleId,
  roles: RoleTable,
  coverageIds: readonly string[],
): DecisionOption {
  const obj = readObject(value, at);
  rejectUnknownKeys(obj, OPTION_KEYS, at);
  const idField = getField(obj, 'id', at);
  const id = readId(idField.value, idField.at);

  const moveField = getField(obj, 'move', at);
  const move = readEnum(moveField.value, MOVE_IDS, moveField.at);
  if (move === 'callForScreen') {
    fail(moveField.at, 'callForScreen is inert in v1; screens are triggered by the play');
  }
  if (!roles[role].moves.includes(move)) {
    fail(moveField.at, `move "${move}" is not available to ${role}`);
  }

  let target: RoleId | undefined;
  if (PASS_MOVES.includes(move)) {
    const targetField = getField(obj, 'target', at);
    target = readRole(targetField.value, targetField.at);
    if (target === role) fail(targetField.at, `expected a teammate of ${role}, got "${target}"`);
  } else if (hasValue(obj, 'target')) {
    fail(childPath(at, 'target'), `unexpected field for move "${move}"`);
  }

  const gradesField = getField(obj, 'grades', at);
  const gradesObj = readObject(gradesField.value, gradesField.at);
  rejectUnknownKeys(gradesObj, coverageIds, gradesField.at);
  const grades: Record<string, DecisionGrade> = {};
  for (const coverageId of coverageIds) {
    const f = getField(gradesObj, coverageId, gradesField.at);
    grades[coverageId] = readEnum(f.value, DECISION_GRADES, f.at);
  }

  return target === undefined ? { id, move, grades } : { id, move, target, grades };
}

function readDecisions(
  value: unknown,
  at: FieldPath,
  ctx: {
    roles: RoleTable;
    playableRoles: readonly RoleId[];
    phaseIds: ReadonlySet<string>;
    reachable: ReadonlySet<string>;
    startPhase: string;
    coverageIds: readonly string[];
  },
): DecisionPoint[] {
  const decisionIds = new Set<string>();
  return readNonEmptyArray(value, at, 'decision').map((raw, i): DecisionPoint => {
    const decAt = childPath(at, i);
    const obj = readObject(raw, decAt);
    rejectUnknownKeys(obj, DECISION_KEYS, decAt);

    const idField = getField(obj, 'id', decAt);
    const id = readId(idField.value, idField.at);
    if (decisionIds.has(id)) fail(idField.at, `duplicate decision id "${id}"`);
    decisionIds.add(id);

    const roleField = getField(obj, 'role', decAt);
    const role = readRole(roleField.value, roleField.at);
    if (!ctx.playableRoles.includes(role)) {
      fail(roleField.at, `role "${role}" is not playable in this play`);
    }

    const phaseField = getField(obj, 'phase', decAt);
    const phase = readPhaseRef(phaseField.value, phaseField.at, ctx.phaseIds);
    if (!ctx.reachable.has(phase)) {
      fail(
        phaseField.at,
        `phase "${phase}" is not reachable from start phase "${ctx.startPhase}"`,
      );
    }

    const optionsField = getField(obj, 'options', decAt);
    const optionIds = new Set<string>();
    // Each (move, target) pair must identify one option so grading is unambiguous.
    const optionActions = new Set<string>();
    const options = readNonEmptyArray(optionsField.value, optionsField.at, 'option').map(
      (rawOpt, j) => {
        const optAt = childPath(optionsField.at, j);
        const option = readOption(rawOpt, optAt, role, ctx.roles, ctx.coverageIds);
        if (optionIds.has(option.id)) {
          fail(childPath(optAt, 'id'), `duplicate option id "${option.id}"`);
        }
        optionIds.add(option.id);
        const actionKey = `${option.move}:${option.target ?? ''}`;
        if (optionActions.has(actionKey)) {
          const what = option.target
            ? `move "${option.move}" to "${option.target}"`
            : `move "${option.move}"`;
          fail(childPath(optAt, 'move'), `duplicate option for ${what}`);
        }
        optionActions.add(actionKey);
        return option;
      },
    );
    for (const coverageId of ctx.coverageIds) {
      if (!options.some((o) => o.grades[coverageId] === 'great')) {
        fail(optionsField.at, `expected a great option for coverage "${coverageId}"`);
      }
    }
    return { id, role, phase, options };
  });
}

/** Reads a play scenario. `at` is rooted at the play id, e.g. `{ file, field: 'giveAndGo' }`. */
export function readPlay(
  obj: Record<string, unknown>,
  at: FieldPath,
  roles: RoleTable,
): PlayScenario {
  // a. keys and scalar fields
  rejectUnknownKeys(obj, PLAY_KEYS, at);
  const idField = getField(obj, 'id', at);
  const id = readId(idField.value, idField.at);
  const kindField = getField(obj, 'kind', at);
  const kind = readEnum(kindField.value, PLAY_KIND, kindField.at);
  const str = (key: string) => {
    const f = getField(obj, key, at);
    return readString(f.value, f.at);
  };
  const name = str('name');
  const blurb = str('blurb');
  const concept = str('concept');
  const diffField = getField(obj, 'difficulty', at);
  const difficulty = readNumber(diffField.value, diffField.at, { min: 1, integer: true });

  // b. playableRoles
  const prField = getField(obj, 'playableRoles', at);
  const playableRoles: RoleId[] = [];
  readNonEmptyArray(prField.value, prField.at, 'playable role').forEach((raw, i) => {
    const roleAt = childPath(prField.at, i);
    const role = readRole(raw, roleAt);
    if (playableRoles.includes(role)) fail(roleAt, `duplicate role "${role}"`);
    if (!roles[role].playable) fail(roleAt, `role "${role}" is not playable in the cast`);
    playableRoles.push(role);
  });

  // c. setup
  const setupField = getField(obj, 'setup', at);
  const setupObj = readObject(setupField.value, setupField.at);
  rejectUnknownKeys(setupObj, SETUP_KEYS, setupField.at);
  const posField = getField(setupObj, 'positions', setupField.at);
  const positions = readRoleRecord(posField.value, posField.at, readCourtPoint);
  const holderField = getField(setupObj, 'ballHolder', setupField.at);
  const ballHolder = readRole(holderField.value, holderField.at);

  // d. phases
  const phasesField = getField(obj, 'phases', at);
  const phases = readPhases(phasesField.value, phasesField.at);
  const phaseIds = new Set(phases.map((p) => p.id));
  const startPhase = (phases[0] as Phase).id;
  const reachable = reachablePhases(phases);
  if (!phases.some((p) => reachable.has(p.id) && p.transitions.length === 0)) {
    fail(phasesField.at, 'expected a reachable terminal phase');
  }

  // e. tracks
  const tracksField = getField(obj, 'tracks', at);
  const tracks = readTracks(tracksField.value, tracksField.at, phaseIds);

  // f. coverages
  const covField = getField(obj, 'coverages', at);
  const { coverages, practiceCoverage } = readCoverages(
    covField.value,
    covField.at,
    phaseIds,
    startPhase,
  );

  // g. decisions
  const decField = getField(obj, 'decisions', at);
  const decisions = readDecisions(decField.value, decField.at, {
    roles,
    playableRoles,
    phaseIds,
    reachable,
    startPhase,
    coverageIds: coverages.map((c) => c.id),
  });

  // h. every playable role has a decision
  for (const role of playableRoles) {
    if (!decisions.some((d) => d.role === role)) {
      fail(decField.at, `expected at least one decision for playable role "${role}"`);
    }
  }

  return {
    kind,
    id,
    name,
    difficulty,
    blurb,
    concept,
    playableRoles,
    setup: { positions, ballHolder },
    phases,
    tracks,
    coverages,
    practiceCoverage,
    decisions,
  };
}
