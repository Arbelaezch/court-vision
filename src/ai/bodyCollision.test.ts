// Body-collision acceptance suite (issue #95): across every play x coverage (Practice and
// Scrimmage), both bots, several seeds and the preview loop, no two player bodies overlap by more
// than a small tolerance after any step. Practice cones are markers, not bodies, so pairs that
// involve a defense player are skipped in cones mode.
import { describe, expect, it } from 'vitest';
import {
  loadCastContent,
  loadMode,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
  type ModeConfig,
  type PlayScenario,
} from '../content';
import type { GameState } from '../sim';
import {
  PREVIEW_MAX_COVERAGE_STEPS,
  createCorrectReadBot,
  createWrongReadBot,
  startPreviewLoop,
  startRunController,
  stepPreviewLoop,
  stepRunController,
  type PlayBot,
} from './index';

const roles = loadCastContent().roles;
const PLAYS = Object.values(loadPlaybook(roles)) as PlayScenario[];
const SETUPS = {
  movement: loadSimMovement(),
  passing: loadSimPassing(),
  shooting: loadSimShooting(),
};
const OPTIONS = { seed: 1, ...SETUPS };
const PRACTICE = loadMode('practice');
const SCRIMMAGE = loadMode('scrimmage');
const SEEDS = [1, 2, 3];
/** Covers the 24 s (1440-step) shot clock with margin: a stalled run fails, never hangs. */
const MAX_STEPS = 2400;
/** Allowed penetration, m. */
const TOLERANCE_M = 0.01;

interface BodyCase {
  play: PlayScenario;
  mode: ModeConfig;
  coverageId: string;
}

const CASES: BodyCase[] = [];
for (const play of PLAYS) {
  CASES.push({ play, mode: PRACTICE, coverageId: play.practiceCoverage });
  for (const c of play.coverages) CASES.push({ play, mode: SCRIMMAGE, coverageId: c.id });
}

/** Returns a description of the first overlapping pair, or null. */
function findOverlap(game: GameState): string | null {
  const collision = game.collision;
  expect(collision).not.toBeNull();
  if (collision === null) return null;
  const { players } = game;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      if (game.defenseMode === 'cones' && (a.side === 'defense' || b.side === 'defense')) continue;
      const limit = collision.profiles[a.role].radiusM + collision.profiles[b.role].radiusM;
      const distance = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (distance < limit - TOLERANCE_M) {
        return `${a.id}(${a.side} ${a.role}) vs ${b.id}(${b.side} ${b.role}): distance ${distance.toFixed(4)} < ${limit.toFixed(4)}`;
      }
    }
  }
  return null;
}

function runChecked(c: BodyCase, seed: number, bot: PlayBot): GameState {
  const id = `${c.play.id}/${c.mode.id}/${c.coverageId}`;
  let controller = startRunController(c.play, c.mode, {
    seed,
    ...SETUPS,
    coverageId: c.coverageId,
  });
  expect(controller.game.collision).not.toBeNull();
  for (let tick = 0; tick < MAX_STEPS; tick++) {
    const step = stepRunController(c.play, controller, bot(controller));
    controller = step.controller;
    const overlap = findOverlap(controller.game);
    if (overlap !== null) throw new Error(`${id} seed ${seed} tick ${tick}: ${overlap}`);
    if (step.attempt !== null) return controller.game;
  }
  throw new Error(`${id} seed ${seed}: no attempt after ${MAX_STEPS} steps`);
}

describe.each(CASES)('bodies never overlap: $play.id in $mode.id vs $coverageId', (c) => {
  it.each(SEEDS)('correct-read bot (seed %i)', (seed) => {
    runChecked(c, seed, createCorrectReadBot(c.play));
  });

  it.each(SEEDS)('wrong-read bot (seed %i)', (seed) => {
    runChecked(c, seed, createWrongReadBot(c.play));
  });
});

describe('bodies never overlap in the preview loop', () => {
  for (const play of PLAYS) {
    it(`${play.id}: every coverage`, () => {
      const bot = createCorrectReadBot(play);
      let loop = startPreviewLoop(play, SCRIMMAGE, OPTIONS);
      expect(loop.controller.game.collision).not.toBeNull();
      let wraps = 0;
      const cap = play.coverages.length * (PREVIEW_MAX_COVERAGE_STEPS + 1);
      for (let tick = 0; tick < cap && wraps < play.coverages.length; tick++) {
        const result = stepPreviewLoop(play, loop, bot);
        loop = result.loop;
        const overlap = findOverlap(loop.controller.game);
        if (overlap !== null) {
          throw new Error(
            `${play.id}/preview coverage ${loop.coverageIndex} tick ${tick}: ${overlap}`,
          );
        }
        if (result.step.reset) wraps += 1;
      }
      expect(wraps).toBe(play.coverages.length);
    });
  }
});

describe('body collision determinism', () => {
  it('the same seed and bot give identical final games', () => {
    const play = PLAYS[0]!;
    const c: BodyCase = { play, mode: SCRIMMAGE, coverageId: play.coverages[0]!.id };
    const first = runChecked(c, 1, createCorrectReadBot(play));
    const second = runChecked(c, 1, createCorrectReadBot(play));
    expect(first).toStrictEqual(second);
  });
});
