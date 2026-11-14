import * as THREE from 'three';
import { loadCastContent, loadSimMovement } from '../content';
import { createGame, passTargetBadges } from '../sim';
import { createBallLayer } from './ball';
import type { BallLayer } from './ball';
import { recordDevTimeline } from './devTimeline';
import { createSimPlayback } from './simPlayback';
import { ballRenderPosition, interpolatePlayers } from './simInterpolation';
import type { SimSnapshot } from './simInterpolation';
import { ANIM_STATES } from './animation';
import type { AnimState } from './animation';
import { characterFitHeight, createCharacterLayer } from './characters';
import type { CharacterPose } from './characters';
import { createPracticeCones } from './cones';
import { createCourtScene } from './courtScene';
import { disposeObject3D } from './dispose';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createPassTargetBadgeAtlas, createPassTargetBadgeLayer } from './passTargetBadges';

export type DevView = 'characters' | 'practice' | 'animations' | 'sim';

export const ANIM_DEV_HOLD_S = 3;

export function parseDevView(value: string | null): DevView | null {
  return value === 'characters' || value === 'practice' || value === 'animations' || value === 'sim'
    ? value
    : null;
}

// Dev scenes: static ones over the initial GameState, and 'sim', which plays a recorded timeline
// with interpolation between fixed steps.
export function createDevScene(
  view: DevView,
  opts: { labelTexture?: THREE.Texture; simStates?: readonly SimSnapshot[] } = {},
): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  topHeight: number;
  update(dtSec: number): void;
  status(): string | null;
  dispose(): void;
} {
  const cast = loadCastContent();
  const game = createGame({ seed: 1, movement: loadSimMovement() });
  const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: opts.labelTexture });
  const topHeight = characterFitHeight(cast.bodyTypes);
  const { scene, camera } = createCourtScene({ topHeight });

  const simStates = view === 'sim' ? (opts.simStates ?? recordDevTimeline()) : null;
  const playback = simStates ? createSimPlayback(simStates) : null;
  const rosterSource = simStates ? simStates[0]!.players : game.players;
  const players =
    view === 'practice' ? game.players.filter((p) => p.side === 'offense') : rosterSource;
  const layer = createCharacterLayer({
    cast,
    roster: players.map(({ id, side, role }) => ({ id, side, role })),
    labels,
  });
  const poses: CharacterPose[] = players.map((p) => ({ id: p.id, pos: p.pos, vel: p.vel }));
  let elapsedS = 0;
  let state: AnimState = 'idle';
  const fillPoses = (): void => {
    players.forEach((p, i) => {
      const speed = 1.5 + i * (6.5 / 9);
      poses[i] = {
        id: p.id,
        pos: p.pos,
        vel: { x: 0, z: p.side === 'offense' ? -speed : speed },
        anim: state,
      };
    });
  };
  if (view === 'animations') fillPoses();
  scene.add(layer.object);

  const badgeLabels = createPassTargetBadgeAtlas({ texture: opts.labelTexture });
  const badges = createPassTargetBadgeLayer({ cast, labels: badgeLabels });
  const disposables: Array<{ dispose(): void }> = [layer, badges];
  let simStatus: string | null = null;
  let ball: BallLayer | null = null;
  const syncSim = (dtSec: number): void => {
    if (!playback || !ball) return;
    const frame = playback.advance(dtSec);
    const simPoses = interpolatePlayers(frame.prev, frame.curr, frame.alpha, (p) =>
      playback.tracker.animFor(p, frame.curr),
    );
    layer.sync(simPoses, frame.curr.controlledPlayerId, dtSec);
    ball.sync(
      ballRenderPosition(frame.prev, frame.curr, frame.alpha, simPoses, playback.tracker.shotArc()),
    );
    simStatus = simPoses.find((p) => p.id === frame.curr.controlledPlayerId)?.anim ?? null;
  };
  if (playback) {
    ball = createBallLayer();
    scene.add(ball.object);
    disposables.push(ball);
    syncSim(0);
  } else {
    layer.sync(poses, game.controlledPlayerId, 0);
    badges.sync(poses, passTargetBadges(game));
    scene.add(badges.object);
  }
  if (view === 'practice') {
    const cones = createPracticeCones({
      teams: cast.teams,
      cones: game.players
        .filter((p) => p.side === 'defense')
        .map((p) => ({ role: p.role, x: p.pos.x, z: p.pos.z })),
      labels,
    });
    scene.add(cones.object);
    disposables.push(cones);
  }

  return {
    scene,
    camera,
    topHeight,
    update(dtSec) {
      if (playback) {
        syncSim(dtSec);
        return;
      }
      if (view === 'animations') {
        elapsedS += Math.max(0, dtSec);
        state = ANIM_STATES[Math.floor(elapsedS / ANIM_DEV_HOLD_S) % ANIM_STATES.length] ?? 'idle';
        fillPoses();
      }
      layer.sync(poses, game.controlledPlayerId, dtSec);
      badges.sync(poses, passTargetBadges(game));
    },
    status() {
      if (view === 'sim') return simStatus;
      return view === 'animations' ? state : null;
    },
    dispose() {
      for (const item of disposables) item.dispose();
      labels.dispose();
      badgeLabels.dispose();
      disposeObject3D(scene);
    },
  };
}
