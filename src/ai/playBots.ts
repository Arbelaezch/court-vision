// Play bots: a correct-read bot and a wrong-read bot that drive the human's role through any play.
//
// Both bots are pure, deterministic and play-agnostic: no Math.random, no clock, no input mutation,
// and no play, coverage or decision ids. They read the PlayScenario only as data, and take the
// coverage and mode from the referee state. A bot has the shape `(state) => SimAction[]`, so a
// RunControllerState fits as-is.
//
// Correct read: when the human holds the ball at a decision point, play the decision's first option
// graded `great` for the run's coverage. With no decision, make the on-path pass (the human's
// active pass/handOff track step, else the phase's passCompleted trigger from the human), once the
// target has reached its own active spot (the gate the AI uses). Otherwise walk toward the
// human's active step spot (or setup spot when it has no step yet).
//
// Wrong read: act like the correct-read bot until the human holds the ball at a decision, then
// pick the first of: an option graded `bad` for this coverage, a pass to a teammate the referee
// calls a wrong teammate, a shot the referee calls off script, and (Practice only) the first
// option graded below `great`. Every candidate is checked with the referee's own classifyAction,
// so the bot cannot disagree with grading.
//
// A track `pass` step has no pass type in the data, so the bots use chestPass for it (and handOff
// for a handOff step), as the AI does.
import { PASS_MOVES, type DecisionPoint, type MoveId, type PlayScenario } from '../content';
import {
  ROLE_ORDER,
  type CourtPoint,
  type GameState,
  type PassType,
  type RoleId,
  type SimAction,
} from '../sim';
import { classifyAction, findDecisionPoint } from './grading';
import { REACHED_SPOT_RADIUS_M, type PlayRunState } from './playRun';
import type { RefereeState, RunMode } from './referee';

export interface PlayBotView {
  readonly game: GameState;
  readonly run: PlayRunState;
  readonly referee: RefereeState;
}

export type PlayBot = (state: PlayBotView) => SimAction[];

export interface BotMove {
  readonly move: MoveId;
  readonly target?: RoleId;
}

/** The first option of `decision` graded `great` for `coverageId`. */
export function correctReadMove(
  play: PlayScenario,
  decision: DecisionPoint,
  coverageId: string,
): BotMove {
  const option = decision.options.find((o) => o.grades[coverageId] === 'great');
  if (option === undefined) {
    throw new Error(
      `Court Vision: decision ${decision.id} of play ${play.id} has no great option for coverage ${coverageId}`,
    );
  }
  return option;
}

/** A move the referee grades as a mistake or a Bad look at `decision` (see the header). */
export function wrongReadMove(
  play: PlayScenario,
  decision: DecisionPoint,
  coverageId: string,
  mode: RunMode,
): BotMove {
  const bad = decision.options.find((o) => o.grades[coverageId] === 'bad');
  if (bad !== undefined) return bad;

  for (const role of ROLE_ORDER) {
    if (role === decision.role) continue;
    // classifyAction grades a pass by targetRole and never reads targetId.
    const graded = classifyAction(play, {
      role: decision.role,
      phaseId: decision.phase,
      coverageId,
      action: { type: 'pass', passType: 'chestPass', targetId: -1 },
      targetRole: role,
    });
    if (graded.kind === 'wrongTeammate') return { move: 'chestPass', target: role };
  }

  const shot = classifyAction(play, {
    role: decision.role,
    phaseId: decision.phase,
    coverageId,
    action: { type: 'shoot' },
    targetRole: null,
  });
  if (shot.kind === 'offScript') return { move: 'shoot' };

  if (mode === 'practice') {
    const weaker = decision.options.find((o) => o.grades[coverageId] !== 'great');
    if (weaker !== undefined) return weaker;
  }
  throw new Error(
    `Court Vision: no wrong read for decision ${decision.id} of play ${play.id} in coverage ${coverageId}`,
  );
}

function toSimAction(game: GameState, move: BotMove): SimAction {
  if (PASS_MOVES.includes(move.move)) {
    const receiver = game.players.find((p) => p.side === 'offense' && p.role === move.target);
    if (receiver === undefined) {
      throw new Error(`Court Vision: the play bots found no offense player for ${move.target}`);
    }
    return { type: 'pass', passType: move.move as PassType, targetId: receiver.id };
  }
  if (move.move === 'shoot') return { type: 'shoot' };
  if (move.move === 'floater') return { type: 'floater' };
  throw new Error(`Court Vision: the play bots cannot perform move ${move.move}`);
}

function moveToward(game: GameState, spot: CourtPoint): SimAction {
  const me = game.players.find((p) => p.id === game.controlledPlayerId);
  if (me === undefined) throw new Error('Court Vision: the play bots found no controlled player');
  const dx = spot.x - me.pos.x;
  const dz = spot.z - me.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return { type: 'move', x: 0, z: 0 };
  const scale = Math.max(d, 1);
  return { type: 'move', x: dx / scale, z: dz / scale };
}

function offensePlayer(game: GameState, role: RoleId) {
  const player = game.players.find((p) => p.side === 'offense' && p.role === role);
  if (player === undefined) throw new Error(`Court Vision: the play bots found no offense ${role}`);
  return player;
}

/** Non-decision behaviour shared by both bots: the on-path pass, or walking to the active spot. */
function pathActions(play: PlayScenario, state: PlayBotView): SimAction[] {
  const { game, run } = state;
  const human = offensePlayer(game, run.humanRole);
  const holds = game.ball.kind === 'held' && game.ball.holderId === human.id;
  if (!holds) {
    return [
      moveToward(game, run.activeSteps[run.humanRole]?.spot ?? play.setup.positions[run.humanRole]),
    ];
  }

  const step = run.activeSteps[run.humanRole];
  let target: RoleId | undefined;
  let passType: PassType = 'chestPass';
  if (
    step !== null &&
    step.phase === run.phaseId &&
    (step.action === 'pass' || step.action === 'handOff') &&
    step.target !== undefined
  ) {
    target = step.target;
    if (step.action === 'handOff') passType = 'handOff';
  } else {
    const phase = play.phases.find((p) => p.id === run.phaseId);
    for (const t of phase?.transitions ?? []) {
      if (t.trigger.kind === 'passCompleted' && t.trigger.from === run.humanRole) {
        target = t.trigger.to;
        break;
      }
    }
  }

  if (target !== undefined) {
    const targetStep = run.activeSteps[target];
    const dx = targetStep === null ? 0 : offensePlayer(game, target).pos.x - targetStep.spot.x;
    const dz = targetStep === null ? 0 : offensePlayer(game, target).pos.z - targetStep.spot.z;
    const targetPlayer = offensePlayer(game, target);
    // The AI skips an out-of-range handOff (the sim would ignore it), so the bot keeps moving.
    const handOffInRange =
      passType !== 'handOff' ||
      Math.hypot(human.pos.x - targetPlayer.pos.x, human.pos.z - targetPlayer.pos.z) <=
        (game.passing?.tuning.handOff.maxDistanceM ?? 0);
    if (handOffInRange && (targetStep === null || Math.hypot(dx, dz) <= REACHED_SPOT_RADIUS_M)) {
      return [toSimAction(game, { move: passType, target })];
    }
  }
  return [
    moveToward(game, run.activeSteps[run.humanRole]?.spot ?? play.setup.positions[run.humanRole]),
  ];
}

function createBot(
  play: PlayScenario,
  pick: (decision: DecisionPoint, referee: RefereeState) => BotMove,
): PlayBot {
  return (state) => {
    if (state.run.playId !== play.id) {
      throw new Error(
        `Court Vision: bot for play ${play.id} was given a run of play ${state.run.playId}`,
      );
    }
    if (state.referee.outcome !== null) return [];
    const { game, run, referee } = state;
    const human = offensePlayer(game, run.humanRole);
    const holds = game.ball.kind === 'held' && game.ball.holderId === human.id;
    const decision = holds ? findDecisionPoint(play, run.humanRole, run.phaseId) : null;
    if (decision !== null) return [toSimAction(game, pick(decision, referee))];
    return pathActions(play, state);
  };
}

export function createCorrectReadBot(play: PlayScenario): PlayBot {
  return createBot(play, (decision, referee) =>
    correctReadMove(play, decision, referee.coverageId),
  );
}

export function createWrongReadBot(play: PlayScenario): PlayBot {
  return createBot(play, (decision, referee) =>
    wrongReadMove(play, decision, referee.coverageId, referee.mode),
  );
}
