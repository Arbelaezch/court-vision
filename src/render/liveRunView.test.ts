import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { startRunController } from '../ai';
import type { RunControllerState } from '../ai';
import { DEFAULT_CUE_TOGGLES, loadCastContent, loadMode } from '../content';
import type { PlayScenario } from '../content';
import { loadAppContent } from '../app/boot';
import { buildRunFrame } from '../app/runFrame';
import { RIM_CENTER, RIM_HEIGHT, createGame, stepGame } from '../sim';
import type { GameState, SimAction } from '../sim';
import { createCourtScene } from './courtScene';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import { createPassTargetBadgeAtlas } from './passTargetBadges';
import { shotArcFromStep } from './simInterpolation';
import type { ShotArc } from './simInterpolation';

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

const MAX_FRAME_STEP_M = 0.5;

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface ShotDraw {
  arc: ShotArc;
  shotType: string;
  blockerId: number | null;
  /** Ball position drawn on the last frame before release (the ball is still held). */
  pre: Vec;
  /** held[k]: the frame k repeats after the release frame (held[0] is the release frame). */
  held: Vec[];
  /** The same frames with the sim stepping on every frame instead of repeating the release game. */
  stepped: Vec[];
}

function dist3(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Draws a shot frame by frame: once with controller-style frozen frames, once with the sim stepping. */
function drawShot(spot: { x: number; z: number }, action: SimAction): ShotDraw {
  const game0 = createGame({
    seed: 1,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
    defenseMode: 'cones',
  });
  game0.players.find((p) => p.id === game0.controlledPlayerId)!.pos = { x: spot.x, z: spot.z };
  const idle = stepGame(game0, []);
  const idle2 = stepGame(idle, []);
  const shotGame = stepGame(idle2, [action]);
  const event = shotGame.events.find((e) => e.type === 'shotResolved');
  if (!event || event.type !== 'shotResolved') throw new Error('no shot on the release step');
  const arc = shotArcFromStep(idle2, shotGame, event);
  if (!arc) throw new Error('no arc');
  const frames = arc.flightTicks + 12;

  const drawer = (): ((g: GameState) => Vec) => {
    const { scene, view } = setup();
    return (g) => {
      view.drawGame({
        game: g,
        humanRole: 'PG',
        steps: [{ game: g, events: [], reset: false }],
        cues: [],
      });
      const p = scene.getObjectByName('ball-mesh')!.position;
      return { x: p.x, y: p.y, z: p.z };
    };
  };

  const drawHeld = drawer();
  drawHeld(game0);
  drawHeld(idle);
  const pre = drawHeld(idle2);
  const held: Vec[] = [];
  for (let k = 0; k < frames; k++) held.push(drawHeld(shotGame));

  const drawLive = drawer();
  drawLive(game0);
  drawLive(idle);
  drawLive(idle2);
  const stepped: Vec[] = [];
  let g = shotGame;
  stepped.push(drawLive(g));
  for (let k = 1; k < frames; k++) {
    g = stepGame(g, []);
    stepped.push(drawLive(g));
  }
  return { arc, shotType: event.shotType, blockerId: event.blockerId, pre, held, stepped };
}

describe('live shot arc', () => {
  it.each([
    ['1.5 m straight out', { x: 0, z: RIM_CENTER.z + 1.5 }],
    ['3 m at 45 degrees', { x: 2.12, z: RIM_CENTER.z + 2.12 }],
    ['4.2 m straight out', { x: 0, z: RIM_CENTER.z + 4.2 }],
  ])('plays a floater smoothly from the hand to the rim (%s)', (_name, spot) => {
    const r = drawShot(spot, { type: 'floater' });
    expect(r.shotType).toBe('floater');
    expect(r.blockerId).toBeNull();
    const path = [r.pre, ...r.held.slice(0, r.arc.flightTicks)];
    for (let i = 1; i < path.length; i++) {
      expect(dist3(path[i - 1]!, path[i]!)).toBeLessThanOrEqual(MAX_FRAME_STEP_M);
    }
    expect(Math.max(...path.map((p) => p.y))).toBeGreaterThanOrEqual(RIM_HEIGHT + 1.0);
    expect(dist3(r.held[r.arc.flightTicks - 1]!, r.arc.to)).toBeLessThan(0.01);
  });

  it('draws the same floater positions whether the sim steps or the frame is held', () => {
    const r = drawShot({ x: 0, z: RIM_CENTER.z + 3 }, { type: 'floater' });
    for (let k = 0; k < r.arc.flightTicks; k++) {
      expect(dist3(r.held[k]!, r.stepped[k]!)).toBeLessThan(1e-9);
    }
  });

  it.each([
    ['layup', { x: 0, z: RIM_CENTER.z + 1 }],
    ['jump shot', { x: 0, z: RIM_CENTER.z + 5 }],
  ])('reaches the rim on held frames for a %s', (name, spot) => {
    const r = drawShot(spot, { type: 'shoot' });
    if (name === 'layup') expect(r.shotType).toBe('layup');
    else expect(['layup', 'floater']).not.toContain(r.shotType);
    const path = [r.pre, ...r.held.slice(0, r.arc.flightTicks)];
    for (let i = 1; i < path.length; i++) {
      expect(dist3(path[i - 1]!, path[i]!)).toBeLessThanOrEqual(1.0);
    }
    expect(dist3(r.held[r.arc.flightTicks - 1]!, r.arc.to)).toBeLessThan(0.01);
  });
});
