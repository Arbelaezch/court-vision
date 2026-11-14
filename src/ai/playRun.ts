// Play-run engine for Practice: AI teammates run their play tracks, phases advance on event
// triggers, screens and AI passes happen automatically, and the Practice cones follow the play's
// standard coverage script.
//
// The engine is pure and deterministic: it never mutates its inputs and uses no wall clock or
// Math.random. It sits on top of the sim (stepGame) and never runs inside it, because the sim does
// not know play content. Each stepPracticeRun call:
//   1. builds PlayerCommands: `place` for every cone that is not at its scripted spot, `steer` for
//      every AI teammate toward its active track step's spot (its setup spot when it has none yet),
//      and an automatic `pass` for an AI `pass` or `handOff` step once it holds the ball and its
//      target has reached its own active step spot;
//   2. steps the game with the human's actions and those commands;
//   3. sets screens: an AI `setScreen` step emits one `screenSet` event per phase when the screener
//      is at its spot and nearly stopped. Decision g4: screens and hand-offs are automatic in
//      Practice; the human never calls them;
//   4. evaluates the current phase's transitions against the new state, in data order, and takes
//      the first whose trigger holds (at most one per step). Phases advance only on triggers, so a
//      slow player is never left behind by a hidden timer; `timeElapsed` is an explicit trigger.
//
// Spacing and lane (spacing.ts): each AI steer is its arrival intent toward the target plus a
// separation push away from the other four offense players within 1 m (the sim clamps the sum).
// The target is moved out of the human's lane (human to rim, half-width 1.2 m) for steps with
// action hold, moveTo or space, for roles with no step yet, and for every non-holder while
// deviated; screeners, cutters, drivers and receivers are exempt because their spots are
// intentionally near the ball.
//
// Deviation: a passCompleted between offense players whose roles match neither a passCompleted
// trigger of the current phase, an active AI pass/handOff step, nor a decision option of the
// current phase for the passer's role (a graded read is on script) sets `deviated`. While deviated
// the phase is frozen (no trigger evaluation), the AI makes no passes and sets no screens, the AI
// ball holder stands still, and everyone else keeps walking to their lane-clear, spaced spot.
// The human's unexpected pass is graded at release by the run referee (./referee.ts) as a
// `wrongTeammate` mistake; the freeze here only keeps the AI still until the caller resets.
//
// The human role's track is not executed: its active step spot only gates AI passes to it (an AI
// passes to the human once the human has reached that spot). Roles map to players by role: the
// offense player with role R is the teammate, the defense player with role R is the cone guarding
// R (coverage defenders are keyed by the role they guard). On a phase change, cones teleport to the
// standard coverage's placement for the new phase (a phase not in the script keeps the previous
// placement), and each role switches to its step for the new phase (else keeps its current step).
// A step carried over from an earlier phase is only a spot to hold: its one-shot actions (setScreen,
// pass, handOff) fire only while the step's own phase is the current one.
//
// Live coverage: when `liveCoverageId` is set, defenders are not cones. They start on that coverage's
// start-phase spots and each step they steer (never teleport) with the behaviors of ./defense.ts
// toward the coverage step for the current phase (a phase not in the script keeps the previous
// step). The referee's Scrimmage `coverageId` should be the same id. While deviated, defenders keep
// running their behaviors.

import type { CoverageStep, DefenderStep, PhaseTrigger, PlayScenario, TrackStep } from '../content';
import {
  ROLE_ORDER,
  SIM_HZ,
  createGame,
  stepGame,
  type CourtPoint,
  type GameEvent,
  type GameState,
  type MovementSetup,
  type PassingSetup,
  type PlayerCommand,
  type PlayerState,
  type RoleId,
  type ShootingSetup,
  type SimAction,
  type TeamSide,
} from '../sim';
import { defenderCommands } from './defense';
import { clearOfLane, separationPush } from './spacing';

/** A player within this distance of a spot has reached it, m. */
export const REACHED_SPOT_RADIUS_M = 0.75;
/** A screener at its spot at or below this speed has set the screen, m/s. */
export const SCREEN_SET_SPEED_MPS = 0.3;
/** AI steer magnitude ramps down linearly inside this distance of the spot, m. */
export const ARRIVE_SLOW_RADIUS_M = 1.5;

/** Track actions whose spots are not intentionally near the ball, so they avoid the lane. */
const LANE_ACTIONS: readonly string[] = ['hold', 'moveTo', 'space'];

/** Below this distance the AI stops steering toward its spot, m. */
const ARRIVED_EPSILON_M = 0.05;

export interface PlayRunState {
  playId: string;
  humanRole: RoleId;
  phaseId: string;
  phaseStartTick: number;
  /** Step each role executes now; null = none yet (hold at its setup spot). */
  activeSteps: Record<RoleId, TrackStep | null>;
  /** Cone spot per guarded role for the current phase (Practice standard coverage). */
  coneSpots: Record<RoleId, CourtPoint>;
  /** Screener roles that emitted screenSet in this phase. */
  screensSet: RoleId[];
  /** Roles whose AI pass or hand-off was issued in this phase. */
  passesMade: RoleId[];
  /** A pass the play does not expect completed: the phase is frozen (see header). */
  deviated: boolean;
  /** Live coverage defenders (null = Practice cones): coverage id and the step each role runs. */
  liveDefense: { coverageId: string; steps: Record<RoleId, DefenderStep> } | null;
}

export interface PracticeRunOptions {
  seed: number;
  movement: MovementSetup;
  passing: PassingSetup;
  shooting?: ShootingSetup;
  /** Default: play.playableRoles[0]. */
  humanRole?: RoleId;
  /** Live defense: defenders follow this coverage's behaviors instead of Practice cones. */
  liveCoverageId?: string;
}

function distance(a: CourtPoint, b: CourtPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function playerFor(game: GameState, side: TeamSide, role: RoleId): PlayerState {
  const player = game.players.find((p) => p.side === side && p.role === role);
  if (player === undefined) {
    throw new Error(`Court Vision: no ${side} player with role ${role} in game state`);
  }
  return player;
}

function holds(game: GameState, playerId: number): boolean {
  return game.ball.kind === 'held' && game.ball.holderId === playerId;
}

function practiceScriptSpots(
  play: PlayScenario,
  phaseId: string,
): Record<RoleId, CourtPoint> | null {
  const coverage = play.coverages.find((c) => c.id === play.practiceCoverage);
  if (coverage === undefined) {
    throw new Error(
      `Court Vision: play ${play.id} has no Practice coverage ${play.practiceCoverage}`,
    );
  }
  const step = coverage.script.find((s) => s.phase === phaseId);
  if (step === undefined) return null;
  const spots: Partial<Record<RoleId, CourtPoint>> = {};
  for (const role of ROLE_ORDER) {
    const { spot } = step.defenders[role];
    spots[role] = { x: spot.x, z: spot.z };
  }
  return spots as Record<RoleId, CourtPoint>;
}

function coverageStepFor(
  play: PlayScenario,
  coverageId: string,
  phaseId: string,
): CoverageStep | null {
  const coverage = play.coverages.find((c) => c.id === coverageId);
  if (coverage === undefined) {
    throw new Error(`Court Vision: play ${play.id} has no coverage ${coverageId}`);
  }
  return coverage.script.find((s) => s.phase === phaseId) ?? null;
}

function stepFor(play: PlayScenario, role: RoleId, phaseId: string): TrackStep | null {
  return play.tracks[role].find((s) => s.phase === phaseId) ?? null;
}

function findPhase(play: PlayScenario, phaseId: string) {
  const phase = play.phases.find((p) => p.id === phaseId);
  if (phase === undefined) {
    throw new Error(`Court Vision: play ${play.id} has no phase ${phaseId}`);
  }
  return phase;
}

/** Steer toward `spot`: full speed outside ARRIVE_SLOW_RADIUS_M, ramping down inside it. */
function arriveIntent(pos: CourtPoint, spot: CourtPoint): CourtPoint {
  const dx = spot.x - pos.x;
  const dz = spot.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVED_EPSILON_M) return { x: 0, z: 0 };
  const scale = Math.max(dist, ARRIVE_SLOW_RADIUS_M);
  return { x: dx / scale, z: dz / scale };
}

/** Whether `role`'s offense player has reached its active step spot (true with no step). */
function atActiveSpot(run: PlayRunState, game: GameState, role: RoleId): boolean {
  const step = run.activeSteps[role];
  if (step === null) return true;
  return distance(playerFor(game, 'offense', role).pos, step.spot) <= REACHED_SPOT_RADIUS_M;
}

/** Starts a Practice run: setup positions, ball holder, cones at the standard coverage's start. */
export function startPracticeRun(
  play: PlayScenario,
  options: PracticeRunOptions,
): { game: GameState; run: PlayRunState } {
  const humanRole = options.humanRole ?? play.playableRoles[0];
  if (humanRole === undefined || !play.playableRoles.includes(humanRole)) {
    throw new Error(
      `Court Vision: humanRole must be one of ${play.playableRoles.join(', ')} for play ${play.id}, got ${String(humanRole)}`,
    );
  }
  const startPhase = play.phases[0];
  if (startPhase === undefined) {
    throw new Error(`Court Vision: play ${play.id} has no phases`);
  }
  let coneSpots: Record<RoleId, CourtPoint>;
  let liveDefense: PlayRunState['liveDefense'] = null;
  if (options.liveCoverageId === undefined) {
    const spots = practiceScriptSpots(play, startPhase.id);
    if (spots === null) {
      throw new Error(
        `Court Vision: Practice coverage of play ${play.id} has no step for start phase ${startPhase.id}`,
      );
    }
    coneSpots = spots;
  } else {
    const startStep = coverageStepFor(play, options.liveCoverageId, startPhase.id);
    if (startStep === null) {
      throw new Error(
        `Court Vision: coverage ${options.liveCoverageId} of play ${play.id} has no step for start phase ${startPhase.id}`,
      );
    }
    const spots: Partial<Record<RoleId, CourtPoint>> = {};
    for (const role of ROLE_ORDER) {
      const { spot } = startStep.defenders[role];
      spots[role] = { x: spot.x, z: spot.z };
    }
    coneSpots = spots as Record<RoleId, CourtPoint>;
    liveDefense = { coverageId: options.liveCoverageId, steps: { ...startStep.defenders } };
  }

  const created = createGame({
    seed: options.seed,
    movement: options.movement,
    passing: options.passing,
    ...(options.shooting === undefined ? {} : { shooting: options.shooting }),
    defenseMode: options.liveCoverageId === undefined ? 'cones' : 'live',
  });
  const game = structuredClone(created);
  for (const role of ROLE_ORDER) {
    const teammate = playerFor(game, 'offense', role);
    const setupSpot = play.setup.positions[role];
    teammate.pos = { x: setupSpot.x, z: setupSpot.z };
    const cone = playerFor(game, 'defense', role);
    cone.pos = { ...coneSpots[role] };
  }
  game.ball = { kind: 'held', holderId: playerFor(game, 'offense', play.setup.ballHolder).id };
  game.controlledPlayerId = playerFor(game, 'offense', humanRole).id;

  const activeSteps: Partial<Record<RoleId, TrackStep | null>> = {};
  for (const role of ROLE_ORDER) {
    activeSteps[role] = stepFor(play, role, startPhase.id);
  }
  const run: PlayRunState = {
    playId: play.id,
    humanRole,
    phaseId: startPhase.id,
    phaseStartTick: game.tick,
    activeSteps: activeSteps as Record<RoleId, TrackStep | null>,
    coneSpots,
    screensSet: [],
    passesMade: [],
    deviated: false,
    liveDefense,
  };
  return { game, run };
}

function buildCommands(
  play: PlayScenario,
  run: PlayRunState,
  game: GameState,
  passesMade: RoleId[],
): PlayerCommand[] {
  const commands: PlayerCommand[] = [];
  if (run.liveDefense === null) {
    for (const role of ROLE_ORDER) {
      const cone = playerFor(game, 'defense', role);
      const spot = run.coneSpots[role];
      if (cone.pos.x !== spot.x || cone.pos.z !== spot.z) {
        commands.push({ type: 'place', playerId: cone.id, x: spot.x, z: spot.z });
      }
    }
  } else {
    commands.push(...defenderCommands(game, run.liveDefense.steps));
  }

  const human = playerFor(game, 'offense', run.humanRole);
  for (const role of ROLE_ORDER) {
    if (role === run.humanRole) continue;
    const self = playerFor(game, 'offense', role);
    const step = run.activeSteps[role];
    if (run.deviated && holds(game, self.id)) {
      commands.push({ type: 'steer', playerId: self.id, x: 0, z: 0 });
      continue;
    }
    const baseTarget = step?.spot ?? play.setup.positions[role];
    const avoidLane = run.deviated || step === null || LANE_ACTIONS.includes(step.action);
    const goal = avoidLane ? clearOfLane(baseTarget, self.pos, human.pos) : baseTarget;
    const arrive = arriveIntent(self.pos, goal);
    const others = ROLE_ORDER.filter((r) => r !== role).map(
      (r) => playerFor(game, 'offense', r).pos,
    );
    const push = separationPush(self.pos, others);
    commands.push({ type: 'steer', playerId: self.id, x: arrive.x + push.x, z: arrive.z + push.z });

    if (run.deviated || step === null || step.target === undefined) continue;
    // A step carried over from an earlier phase is a hold, never a second pass.
    if (step.phase !== run.phaseId) continue;
    if (step.action !== 'pass' && step.action !== 'handOff') continue;
    if (passesMade.includes(role) || !holds(game, self.id)) continue;
    if (!atActiveSpot(run, game, step.target)) continue;
    const target = playerFor(game, 'offense', step.target);
    if (step.action === 'handOff') {
      const maxDistanceM = game.passing?.tuning.handOff.maxDistanceM ?? 0;
      if (distance(self.pos, target.pos) > maxDistanceM) continue;
    }
    commands.push({
      type: 'pass',
      playerId: self.id,
      passType: step.action === 'handOff' ? 'handOff' : 'chestPass',
      targetId: target.id,
    });
    passesMade.push(role);
  }
  return commands;
}

/** Emits screenSet for every AI screener that is set at its spot; returns the new screener roles. */
function setScreens(run: PlayRunState, next: GameState): RoleId[] {
  const screensSet = [...run.screensSet];
  for (const role of ROLE_ORDER) {
    if (role === run.humanRole) continue;
    const step = run.activeSteps[role];
    if (step === null || step.action !== 'setScreen' || step.target === undefined) continue;
    // A step carried over from an earlier phase is a hold, never a second screen.
    if (step.phase !== run.phaseId) continue;
    if (screensSet.includes(role)) continue;
    const screener = playerFor(next, 'offense', role);
    const atSpot = distance(screener.pos, step.spot) <= REACHED_SPOT_RADIUS_M;
    const stopped = Math.hypot(screener.vel.x, screener.vel.z) <= SCREEN_SET_SPEED_MPS;
    if (!atSpot || !stopped) continue;
    next.events.push({
      type: 'screenSet',
      tick: next.tick,
      screenerId: screener.id,
      targetId: playerFor(next, 'offense', step.target).id,
    });
    screensSet.push(role);
  }
  return screensSet;
}

function triggerHolds(
  trigger: PhaseTrigger,
  run: PlayRunState,
  next: GameState,
  events: readonly GameEvent[],
): boolean {
  switch (trigger.kind) {
    case 'reachedSpot': {
      const { pos } = playerFor(next, 'offense', trigger.role);
      return distance(pos, trigger.spot) <= REACHED_SPOT_RADIUS_M;
    }
    case 'passCompleted': {
      const fromId = playerFor(next, 'offense', trigger.from).id;
      const toId = playerFor(next, 'offense', trigger.to).id;
      return events.some(
        (e) => e.type === 'passCompleted' && e.passerId === fromId && e.receiverId === toId,
      );
    }
    case 'screenSet': {
      const screenerId = playerFor(next, 'offense', trigger.screener).id;
      return events.some((e) => e.type === 'screenSet' && e.screenerId === screenerId);
    }
    case 'timeElapsed':
      return next.tick - run.phaseStartTick >= Math.round(trigger.seconds * SIM_HZ);
    case 'defenseReaction':
      // No producer yet: neither cones nor live defenders emit a reaction trigger.
      return false;
    default: {
      const unreachable: never = trigger;
      throw new Error(
        `Court Vision: unknown phase trigger ${String((unreachable as { kind: unknown }).kind)}`,
      );
    }
  }
}

/**
 * Whether a pass completed this step that the play does not expect: its (passer role, receiver
 * role) matches neither a passCompleted trigger of the current phase, an active AI pass or
 * hand-off step, nor a decision option of the current phase for the passer's role.
 */
function isDeviation(
  play: PlayScenario,
  run: PlayRunState,
  next: GameState,
  phase: PlayScenario['phases'][number],
): boolean {
  const roleOf = (id: number): RoleId | null => {
    const p = next.players.find((q) => q.id === id);
    return p !== undefined && p.side === 'offense' ? p.role : null;
  };
  for (const e of next.events) {
    if (e.type !== 'passCompleted') continue;
    const from = roleOf(e.passerId);
    const to = roleOf(e.receiverId);
    if (from === null || to === null) continue;
    const expectedByTrigger = phase.transitions.some(
      (t) => t.trigger.kind === 'passCompleted' && t.trigger.from === from && t.trigger.to === to,
    );
    const step = run.activeSteps[from];
    const expectedByStep =
      from !== run.humanRole &&
      step !== null &&
      (step.action === 'pass' || step.action === 'handOff') &&
      step.target === to;
    const expectedByDecision = play.decisions.some(
      (d) => d.phase === run.phaseId && d.role === from && d.options.some((o) => o.target === to),
    );
    if (!expectedByTrigger && !expectedByStep && !expectedByDecision) return true;
  }
  return false;
}

/**
 * Advances a Practice run by one sim step: AI commands, the human's actions, automatic screens,
 * then at most one phase transition. Pure: returns a new game and run.
 */
export function stepPracticeRun(
  play: PlayScenario,
  run: PlayRunState,
  game: GameState,
  actions: readonly SimAction[],
): { game: GameState; run: PlayRunState } {
  if (play.id !== run.playId) {
    throw new Error(`Court Vision: run is for play ${run.playId}, got play ${play.id}`);
  }
  const passesMade = [...run.passesMade];
  const commands = buildCommands(play, run, game, passesMade);
  const next = stepGame(game, actions, commands);
  const phase = findPhase(play, run.phaseId);
  const deviated = run.deviated || isDeviation(play, run, next, phase);
  if (deviated) {
    // Frozen: no screens, no phase change; the run stays deviated.
    return { game: next, run: { ...run, deviated, passesMade } };
  }
  const screensSet = setScreens(run, next);

  const taken = phase.transitions.find((t) => triggerHolds(t.trigger, run, next, next.events));
  if (taken === undefined) {
    return { game: next, run: { ...run, screensSet, passesMade } };
  }

  const activeSteps = { ...run.activeSteps };
  for (const role of ROLE_ORDER) {
    const step = stepFor(play, role, taken.to);
    if (step !== null) activeSteps[role] = step;
  }
  const liveStep =
    run.liveDefense === null ? null : coverageStepFor(play, run.liveDefense.coverageId, taken.to);
  const liveDefense =
    run.liveDefense === null || liveStep === null
      ? run.liveDefense
      : { coverageId: run.liveDefense.coverageId, steps: { ...liveStep.defenders } };
  return {
    game: next,
    run: {
      ...run,
      liveDefense,
      phaseId: taken.to,
      phaseStartTick: next.tick,
      activeSteps,
      coneSpots: practiceScriptSpots(play, taken.to) ?? run.coneSpots,
      screensSet: [],
      passesMade: [],
    },
  };
}
