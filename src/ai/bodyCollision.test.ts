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

/** Extra gap counted as touching, m. */
const CONTACT_SLACK_M = 0.02;
/** Most a held screener may be moved off its hold spot while touching a defender, m. */
const HOLD_DISPLACEMENT_M = 0.15;
/** Plays that must show a defender meeting a held screen (the check is not vacuous). */
const CONTACT_PLAYS = ['highPickAndRoll', 'hornsSet', 'dribbleHandoff'];

const SCREEN_PLAYS = PLAYS.filter((play) =>
  Object.values(play.tracks).some((track) =>
    track.some((s) => s.action === 'setScreen' || s.action === 'handOff'),
  ),
);

/**
 * Runs a Scrimmage case with the correct-read bot and the overlap check; returns how many
 * defender contacts a held screener had. Throws when a touched screener is off its hold spot.
 */
function runHoldChecked(play: PlayScenario, coverageId: string, seed: number): number {
  const id = `${play.id}/${SCRIMMAGE.id}/${coverageId}`;
  const bot = createCorrectReadBot(play);
  let controller = startRunController(play, SCRIMMAGE, { seed, ...SETUPS, coverageId });
  let contacts = 0;
  for (let tick = 0; tick < MAX_STEPS; tick++) {
    const step = stepRunController(play, controller, bot(controller));
    controller = step.controller;
    const { game } = controller;
    const overlap = findOverlap(game);
    if (overlap !== null) throw new Error(`${id} seed ${seed} tick ${tick}: ${overlap}`);
    const profiles = game.collision?.profiles;
    if (profiles === undefined) throw new Error(`${id}: no collision setup`);
    for (const hold of controller.run.screenHolds) {
      const screener = game.players.find((p) => p.side === 'offense' && p.role === hold.role);
      if (screener === undefined) throw new Error(`${id}: no screener ${hold.role}`);
      for (const defender of game.players.filter((p) => p.side === 'defense')) {
        const gap = Math.hypot(screener.pos.x - defender.pos.x, screener.pos.z - defender.pos.z);
        const limit = profiles[screener.role].radiusM + profiles[defender.role].radiusM;
        if (gap > limit + CONTACT_SLACK_M) continue;
        contacts += 1;
        const moved = Math.hypot(screener.pos.x - hold.spot.x, screener.pos.z - hold.spot.z);
        if (moved > HOLD_DISPLACEMENT_M) {
          throw new Error(
            `${id} seed ${seed} tick ${tick}: screener ${screener.id}(${hold.role}) touched by defender ${defender.id}(${defender.role}) is ${moved.toFixed(4)} m off its hold spot`,
          );
        }
      }
    }
    if (step.attempt !== null) return contacts;
  }
  throw new Error(`${id} seed ${seed}: no attempt after ${MAX_STEPS} steps`);
}

describe('set screens hold in real plays (Scrimmage)', () => {
  it('finds every play that must show contact among the screen plays', () => {
    const ids = SCREEN_PLAYS.map((p) => p.id);
    for (const id of CONTACT_PLAYS) expect(ids).toContain(id);
  });

  for (const play of SCREEN_PLAYS) {
    it(`${play.id}: a touched held screener stays on its spot in every coverage and seed`, () => {
      let contacts = 0;
      for (const coverage of play.coverages) {
        for (const seed of SEEDS) contacts += runHoldChecked(play, coverage.id, seed);
      }
      if (CONTACT_PLAYS.includes(play.id)) expect(contacts).toBeGreaterThan(0);
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
