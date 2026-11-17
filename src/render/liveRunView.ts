import * as THREE from 'three';
import type { RunControllerState } from '../ai';
import type { CastContent, Cue } from '../content';
import type { RunFrame } from '../app/runFrame';
import { FIXED_DT, passTargetBadges } from '../sim';
import type { GameEvent, GameState, RoleId } from '../sim';
import { createBallLayer } from './ball';
import type { BallLayer } from './ball';
import { createCharacterLayer } from './characters';
import type { CharacterLayer } from './characters';
import { createPracticeCones } from './cones';
import type { ConeSpot } from './cones';
import { createCueLayer } from './cueLayer';
import type { CueLayer } from './cueLayer';
import { disposeObject3D } from './dispose';
import type { LabelAtlas } from './labelAtlas';
import { createPassTargetBadgeLayer } from './passTargetBadges';
import type { PassTargetBadgeLayer } from './passTargetBadges';
import { createSimAnimTracker } from './simAnimation';
import { ballRenderPosition, interpolatePlayers } from './simInterpolation';
import type { SimSnapshot } from './simInterpolation';

export interface LiveDrawStep {
  readonly game: GameState;
  readonly events: readonly GameEvent[];
  readonly reset: boolean;
}

export interface LiveDrawInput {
  readonly game: GameState;
  readonly humanRole: RoleId;
  readonly steps: readonly LiveDrawStep[];
  readonly cues: readonly Cue[];
}

export interface LiveRunView {
  draw(controller: RunControllerState, frame: RunFrame): void;
  /** Draws a bare game state (no run controller), e.g. the tutorial sandbox. */
  drawGame(input: LiveDrawInput): void;
  /** Hides and disposes the run objects (on quit). The next draw rebuilds them. */
  clear(): void;
  /** Stops the target-ring pulse when on. */
  setReduceMotion(on: boolean): void;
  dispose(): void;
}

interface RunObjects {
  key: string;
  layer: CharacterLayer;
  ball: BallLayer;
  badges: PassTargetBadgeLayer;
  cues: CueLayer;
  cones: { sync(cones: readonly ConeSpot[]): void; dispose(): void } | null;
}

// Draws the live run straight from the controller state: one pose per sim step, no interpolation.
// The shot arc runs on the tracker's arc clock, so it keeps playing while the controller holds the frame.
export function createLiveRunView(opts: {
  scene: THREE.Scene;
  cast: CastContent;
  labels: LabelAtlas;
  badgeLabels: LabelAtlas;
}): LiveRunView {
  const { scene, cast, labels, badgeLabels } = opts;
  const group = new THREE.Group();
  group.name = 'live-run';
  scene.add(group);

  const tracker = createSimAnimTracker();
  let prevGame: SimSnapshot | null = null;
  let objects: RunObjects | null = null;
  let reduceMotion = false;

  const teardown = (): void => {
    if (!objects) return;
    objects.layer.dispose();
    objects.ball.dispose();
    objects.badges.dispose();
    objects.cues.dispose();
    objects.cones?.dispose();
    for (const child of [...group.children]) group.remove(child);
    objects = null;
  };

  const build = (game: SimSnapshot, key: string): RunObjects => {
    const coned = game.defenseMode === 'cones';
    const roster = game.players
      .filter((p) => !coned || p.side === 'offense')
      .map(({ id, side, role }) => ({ id, side, role }));
    const layer = createCharacterLayer({ cast, roster, labels });
    const ball = createBallLayer();
    const badges = createPassTargetBadgeLayer({ cast, labels: badgeLabels });
    const cues = createCueLayer();
    group.add(layer.object, ball.object, badges.object, cues.object);
    let cones: RunObjects['cones'] = null;
    if (coned) {
      const made = createPracticeCones({
        teams: cast.teams,
        cones: defenseSpots(game),
        labels,
      });
      group.add(made.object);
      cones = made;
    }
    return { key, layer, ball, badges, cues, cones };
  };

  function drawGame(input: LiveDrawInput): void {
    const game: SimSnapshot = input.game;
    const key = `${game.defenseMode}:${game.players.map((p) => p.id).join(',')}`;
    if (objects && objects.key !== key) {
      teardown();
      tracker.reset();
      prevGame = null;
    }
    objects ??= build(game, key);

    for (const step of input.steps) {
      const stepGame: SimSnapshot = step.game;
      if (step.reset) tracker.reset();
      else tracker.observe(prevGame ?? stepGame, stepGame, step.events);
      prevGame = stepGame;
    }
    prevGame = game;

    const poses = interpolatePlayers(game, game, 0, (p) => tracker.animFor(p, game));
    const dtSec = input.steps.length * FIXED_DT;
    objects.layer.sync(poses, game.controlledPlayerId, dtSec);
    objects.ball.sync(
      ballRenderPosition(
        game,
        game,
        0,
        poses,
        tracker.shotArc(),
        tracker.shotArcTick() ?? undefined,
      ),
    );
    objects.badges.sync(poses, passTargetBadges(input.game));
    objects.cones?.sync(defenseSpots(game));

    const offense: Partial<Record<RoleId, { x: number; z: number }>> = {};
    for (const p of game.players) if (p.side === 'offense') offense[p.role] = p.pos;
    objects.cues.sync({
      cues: input.cues,
      offense,
      humanRole: input.humanRole,
      dtSec,
      reduceMotion,
    });
  }

  return {
    drawGame,
    setReduceMotion(on) {
      reduceMotion = on;
    },
    draw(controller, frame) {
      drawGame({
        game: controller.game,
        humanRole: controller.run.humanRole,
        steps: frame.steps.map((s) => ({
          game: s.controller.game,
          events: s.events,
          reset: s.reset,
        })),
        cues: frame.cues,
      });
    },
    clear() {
      teardown();
      tracker.reset();
      prevGame = null;
    },
    dispose() {
      teardown();
      scene.remove(group);
      disposeObject3D(group);
    },
  };
}

function defenseSpots(game: SimSnapshot): ConeSpot[] {
  return game.players
    .filter((p) => p.side === 'defense')
    .map((p) => ({ role: p.role, x: p.pos.x, z: p.pos.z }));
}
