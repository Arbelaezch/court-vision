import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type PlayScenario,
} from '../content';
import {
  correctReadMove,
  createCorrectReadBot,
  createWrongReadBot,
  startRunController,
  wrongReadMove,
} from './index';
import { SCREEN_TEST_PLAY_DATA, SCREEN_TEST_PLAY_FILE } from './testPlays';

const roles = loadCastContent().roles;
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const GIVE_AND_GO = loadPlaybook(roles).giveAndGo as PlayScenario;
const SCREEN_TEST = loadPlaybook(roles, [
  { file: SCREEN_TEST_PLAY_FILE, data: SCREEN_TEST_PLAY_DATA },
]).screenTest as PlayScenario;

function decisionOf(play: PlayScenario, id: string) {
  const decision = play.decisions.find((d) => d.id === id);
  if (decision === undefined) throw new Error(`no decision ${id}`);
  return decision;
}

describe('correctReadMove', () => {
  const finishRead = decisionOf(GIVE_AND_GO, 'finishRead');

  it('picks the great option for each Give-and-Go coverage', () => {
    expect(correctReadMove(GIVE_AND_GO, finishRead, 'ballWatch')).toMatchObject({ move: 'shoot' });
    expect(correctReadMove(GIVE_AND_GO, finishRead, 'helpOnCut')).toMatchObject({
      move: 'chestPass',
      target: 'SF',
    });
  });

  it('is play-agnostic: picks from the data of another play', () => {
    const rollRead = decisionOf(SCREEN_TEST, 'rollRead');
    expect(correctReadMove(SCREEN_TEST, rollRead, 'standard')).toMatchObject({
      move: 'bouncePass',
      target: 'C',
    });
    expect(correctReadMove(SCREEN_TEST, rollRead, 'switchAll')).toMatchObject({ move: 'shoot' });
  });

  it('throws when there is no great option', () => {
    const rollRead = decisionOf(SCREEN_TEST, 'rollRead');
    expect(() => correctReadMove(SCREEN_TEST, rollRead, 'nope')).toThrow(/Court Vision:/);
  });
});

describe('wrongReadMove', () => {
  it('picks a wrong teammate for ballWatch in both modes', () => {
    const finishRead = decisionOf(GIVE_AND_GO, 'finishRead');
    for (const mode of ['scrimmage', 'practice'] as const) {
      // The decision at ballWatch is graded per coverage; use the ballWatch coverage.
      expect(wrongReadMove(GIVE_AND_GO, finishRead, 'ballWatch', mode)).toMatchObject({
        move: 'chestPass',
        target: 'SG',
      });
    }
  });

  it('picks the Bad option for helpOnCut', () => {
    const finishRead = decisionOf(GIVE_AND_GO, 'finishRead');
    const move = wrongReadMove(GIVE_AND_GO, finishRead, 'helpOnCut', 'scrimmage');
    expect(move.move).toBe('shoot');
  });

  it('is play-agnostic: picks a wrong teammate for the screen test read', () => {
    const rollRead = decisionOf(SCREEN_TEST, 'rollRead');
    for (const coverageId of ['standard', 'switchAll']) {
      expect(wrongReadMove(SCREEN_TEST, rollRead, coverageId, 'scrimmage')).toMatchObject({
        move: 'chestPass',
        target: 'SG',
      });
    }
  });

  describe('with no wrong teammate, Bad option or off-script shot', () => {
    const data = structuredClone(SCREEN_TEST_PLAY_DATA);
    const good = { standard: 'good', switchAll: 'good' };
    data.decisions[0]!.options.push(
      { id: 'toSG', move: 'chestPass', target: 'SG', grades: good },
      { id: 'toSF', move: 'chestPass', target: 'SF', grades: good },
      { id: 'toPF', move: 'chestPass', target: 'PF', grades: good },
    );
    const play = loadPlaybook(roles, [{ file: SCREEN_TEST_PLAY_FILE, data }])
      .screenTest as PlayScenario;
    const rollRead = decisionOf(play, 'rollRead');

    it('throws in Scrimmage', () => {
      expect(() => wrongReadMove(play, rollRead, 'switchAll', 'scrimmage')).toThrow(
        /Court Vision: no wrong read/,
      );
    });

    it('picks a non-great option in Practice', () => {
      const move = wrongReadMove(play, rollRead, 'standard', 'practice');
      const option = rollRead.options.find((o) => o.id === (move as { id?: string }).id);
      expect(option?.grades.standard).toBe('good');
    });
  });
});

describe('play bots on a real run', () => {
  const controller = startRunController(GIVE_AND_GO, loadMode('practice'), { seed: 1, ...SETUPS });
  const sg = controller.game.players.find((p) => p.side === 'offense' && p.role === 'SG');

  for (const [name, bot] of [
    ['correct-read', createCorrectReadBot(GIVE_AND_GO)],
    ['wrong-read', createWrongReadBot(GIVE_AND_GO)],
  ] as const) {
    describe(name, () => {
      it('makes the entry pass to the SG on the first state', () => {
        const actions = bot(controller);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({ type: 'pass', targetId: sg?.id });
      });

      it('returns no actions once the run has an outcome', () => {
        const done = {
          ...controller,
          referee: {
            ...controller.referee,
            outcome: { kind: 'unsuccessful' as const, tick: 1, reason: 'x' },
          },
        };
        expect(bot(done)).toEqual([]);
      });

      it('is deterministic and does not mutate the state', () => {
        const before = structuredClone(controller);
        const first = bot(controller);
        const second = bot(controller);
        expect(second).toEqual(first);
        expect(controller).toEqual(before);
      });

      it('throws for a state of another play', () => {
        const other = { ...GIVE_AND_GO, id: 'other' };
        const otherBot =
          name === 'correct-read' ? createCorrectReadBot(other) : createWrongReadBot(other);
        expect(() => otherBot(controller)).toThrow(/Court Vision:/);
      });
    });
  }

  describe('with an on-path handOff step', () => {
    type Mutable = {
      run: { activeSteps: Record<string, unknown>; humanRole: string };
      game: { passing?: { tuning: { handOff: { maxDistanceM: number } } } };
    };
    const withHandOff = (maxDistanceM: number) => {
      const state = structuredClone(controller) as unknown as Mutable;
      const role = state.run.humanRole;
      state.run.activeSteps[role] = {
        ...(state.run.activeSteps[role] as object),
        action: 'handOff',
        target: 'SG',
        phase: controller.run.phaseId,
      };
      if (state.game.passing === undefined) throw new Error('no passing state');
      state.game.passing.tuning.handOff.maxDistanceM = maxDistanceM;
      return state as unknown as typeof controller;
    };

    for (const [name, bot] of [
      ['correct-read', createCorrectReadBot(GIVE_AND_GO)],
      ['wrong-read', createWrongReadBot(GIVE_AND_GO)],
    ] as const) {
      it(`${name} bot moves instead of handing off out of range`, () => {
        const actions = bot(withHandOff(0));
        expect(actions).toHaveLength(1);
        expect(actions[0]?.type).toBe('move');
      });

      it(`${name} bot hands off in range`, () => {
        const actions = bot(withHandOff(1000));
        expect(actions[0]).toMatchObject({ type: 'pass', passType: 'handOff', targetId: sg?.id });
      });
    }
  });
});
