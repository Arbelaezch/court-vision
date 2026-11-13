import * as THREE from 'three';
import { loadCastContent, loadSimMovement } from '../content';
import { createGame } from '../sim';
import { characterFitHeight, createCharacterLayer } from './characters';
import { createPracticeCones } from './cones';
import { createCourtScene } from './courtScene';
import { disposeObject3D } from './dispose';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';

export type DevView = 'characters' | 'practice';

export function parseDevView(value: string | null): DevView | null {
  return value === 'characters' || value === 'practice' ? value : null;
}

// Static dev scenes over the initial GameState; real sim wiring arrives with the practice slice.
export function createDevScene(
  view: DevView,
  opts: { labelTexture?: THREE.Texture } = {},
): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  topHeight: number;
  dispose(): void;
} {
  const cast = loadCastContent();
  const game = createGame({ seed: 1, movement: loadSimMovement() });
  const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: opts.labelTexture });
  const topHeight = characterFitHeight(cast.bodyTypes);
  const { scene, camera } = createCourtScene({ topHeight });

  const players =
    view === 'characters' ? game.players : game.players.filter((p) => p.side === 'offense');
  const layer = createCharacterLayer({
    cast,
    roster: players.map(({ id, side, role }) => ({ id, side, role })),
    labels,
  });
  layer.sync(players, game.controlledPlayerId);
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
    dispose() {
      for (const item of disposables) item.dispose();
      labels.dispose();
      disposeObject3D(scene);
    },
  };
}
