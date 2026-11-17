import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { startRunController } from '../ai';
import type { RunControllerState } from '../ai';
import { DEFAULT_CUE_TOGGLES, loadCastContent, loadMode } from '../content';
import type { PlayScenario } from '../content';
import { loadAppContent } from '../app/boot';
import { buildRunFrame } from '../app/runFrame';
import { createGame } from '../sim';
import { createCourtScene } from './courtScene';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import { createPassTargetBadgeAtlas } from './passTargetBadges';

const CONTENT = loadAppContent();
const PLAY = CONTENT.plays.giveAndGo as PlayScenario;
const cast = loadCastContent();

function start(): RunControllerState {
  return startRunController(PLAY, loadMode('practice'), {
    seed: 1,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
  });
}

function setup(): { scene: THREE.Scene; view: ReturnType<typeof createLiveRunView> } {
  const { scene } = createCourtScene();
  const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: new THREE.Texture() });
  const badgeLabels = createPassTargetBadgeAtlas({ texture: new THREE.Texture() });
  return { scene, view: createLiveRunView({ scene, cast, labels, badgeLabels }) };
}

function names(scene: THREE.Scene): string[] {
  const out: string[] = [];
  scene.traverse((o) => out.push(o.name));
  return out;
}

describe('live run view', () => {
  it('draws five offense rigs and five cones, with four badges while the PG has the ball', () => {
    const { scene, view } = setup();
    const controller = start();
    view.draw(controller, buildRunFrame(PLAY, controller, [], DEFAULT_CUE_TOGGLES));
    const all = names(scene);
    expect(all.filter((n) => n.startsWith('jersey-'))).toHaveLength(5);
    expect(all.filter((n) => n.startsWith('cone-label-'))).toHaveLength(5);
    const badges = scene.getObjectByName('pass-target-badges')!;
    expect(badges.children.filter((c) => c.visible)).toHaveLength(4);
    expect(all).toContain('ball');
    expect(all).toContain('cues');
  });

  it('drawGame draws a bare cones game', () => {
    const { scene, view } = setup();
    const game = createGame({
      seed: 1,
      movement: CONTENT.movement,
      passing: CONTENT.passing,
      shooting: CONTENT.shooting,
      defenseMode: 'cones',
    });
    view.drawGame({
      game,
      humanRole: 'PG',
      steps: [{ game, events: [], reset: false }],
      cues: [],
    });
    const all = names(scene);
    expect(all.filter((n) => n.startsWith('jersey-'))).toHaveLength(5);
    expect(all.filter((n) => n.startsWith('cone-label-'))).toHaveLength(5);
    expect(all).toContain('ball');
  });

  it('keeps the target ring at scale 1 under reduce motion', () => {
    const { scene, view } = setup();
    view.setReduceMotion(true);
    const game = createGame({
      seed: 1,
      movement: CONTENT.movement,
      passing: CONTENT.passing,
      shooting: CONTENT.shooting,
      defenseMode: 'cones',
    });
    const input = {
      game,
      humanRole: 'PG' as const,
      steps: [
        { game, events: [], reset: false },
        { game, events: [], reset: false },
      ],
      cues: [{ kind: 'targetRing' as const, role: 'SG' as const }],
    };
    for (let i = 0; i < 2; i++) {
      view.drawGame(input);
      const ring = scene.getObjectByName('cue-target-ring-0')!;
      expect(ring.visible).toBe(true);
      expect(ring.scale.x).toBe(1);
      expect(ring.scale.z).toBe(1);
    }
  });

  it('handles a reset step', () => {
    const { view } = setup();
    const controller = start();
    const step = { controller, events: [], attempt: null, reset: true };
    expect(() =>
      view.draw(controller, buildRunFrame(PLAY, controller, [step], DEFAULT_CUE_TOGGLES)),
    ).not.toThrow();
  });

  it('clear removes run objects and dispose removes the group', () => {
    const { scene, view } = setup();
    const controller = start();
    const frame = buildRunFrame(PLAY, controller, [], DEFAULT_CUE_TOGGLES);
    view.draw(controller, frame);
    view.clear();
    expect(names(scene)).not.toContain('characters');
    view.draw(controller, frame);
    expect(names(scene)).toContain('characters');
    view.dispose();
    expect(names(scene)).not.toContain('live-run');
    expect(names(scene)).not.toContain('characters');
  });
});
