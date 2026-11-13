import * as THREE from 'three';
import { loadCastContent, loadSimMovement } from '../content';
import { createGame } from '../sim';
import { ANIM_STATES } from './animation';
import type { AnimState } from './animation';
import { characterFitHeight, createCharacterLayer } from './characters';
import type { CharacterPose } from './characters';
import { createPracticeCones } from './cones';
import { createCourtScene } from './courtScene';
import { disposeObject3D } from './dispose';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';

export type DevView = 'characters' | 'practice' | 'animations';

export const ANIM_DEV_HOLD_S = 3;

export function parseDevView(value: string | null): DevView | null {
  return value === 'characters' || value === 'practice' || value === 'animations' ? value : null;
}

// Static dev scenes over the initial GameState; real sim wiring arrives with the practice slice.
export function createDevScene(
  view: DevView,
  opts: { labelTexture?: THREE.Texture } = {},
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

  const players =
    view === 'practice' ? game.players.filter((p) => p.side === 'offense') : game.players;
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
  layer.sync(poses, game.controlledPlayerId, 0);
  scene.add(layer.object);

  const disposables: Array<{ dispose(): void }> = [layer];
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
      if (view === 'animations') {
        elapsedS += Math.max(0, dtSec);
        state = ANIM_STATES[Math.floor(elapsedS / ANIM_DEV_HOLD_S) % ANIM_STATES.length] ?? 'idle';
        fillPoses();
      }
      layer.sync(poses, game.controlledPlayerId, dtSec);
    },
    status() {
      return view === 'animations' ? state : null;
    },
    dispose() {
      for (const item of disposables) item.dispose();
      labels.dispose();
      disposeObject3D(scene);
    },
  };
}
