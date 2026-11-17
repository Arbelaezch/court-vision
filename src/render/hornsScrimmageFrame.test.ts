import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_MAX_COVERAGE_STEPS,
  createCorrectReadBot,
  startPreviewLoop,
  stepPreviewLoop,
} from '../ai';
import type { PreviewLoopState } from '../ai';
import type { RunControllerStep } from '../ai';
import { DEFAULT_CUE_TOGGLES, loadCastContent, loadMode } from '../content';
import type { PlayScenario } from '../content';
import { loadAppContent } from '../app/boot';
import { buildRunFrame } from '../app/runFrame';
import { SIM_HZ } from '../sim';
import { characterFitHeight } from './characters';
import { createCourtScene } from './courtScene';
import { countDrawCalls } from './drawCalls';
import { collectCastLabels, createLabelAtlas } from './labelAtlas';
import { createLiveRunView } from './liveRunView';
import { createPassTargetBadgeAtlas } from './passTargetBadges';

const CONTENT = loadAppContent();
const PLAY = CONTENT.plays.hornsSet as PlayScenario;
const MODE = loadMode('scrimmage');
const cast = loadCastContent();
const STEPS_PER_FRAME = SIM_HZ / 30;
const FRAME_MS = 1000 / 30;

function setup() {
  const { scene } = createCourtScene({ topHeight: characterFitHeight(cast.bodyTypes) });
  const labels = createLabelAtlas(collectCastLabels(cast.teams), { texture: new THREE.Texture() });
  const badgeLabels = createPassTargetBadgeAtlas({ texture: new THREE.Texture() });
  const view = createLiveRunView({ scene, cast, labels, badgeLabels });
  let loop: PreviewLoopState = startPreviewLoop(PLAY, MODE, {
    seed: 1,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
  });
  const bot = createCorrectReadBot(PLAY);
  /** One 30 FPS frame: sim steps, render prep, draw, and the draw-item count. */
  function frame(): { coverageIndex: number; drawItems: number } {
    const steps: RunControllerStep[] = [];
    for (let i = 0; i < STEPS_PER_FRAME; i += 1) {
      const result = stepPreviewLoop(PLAY, loop, bot);
      loop = result.loop;
      steps.push(result.step);
    }
    view.draw(loop.controller, buildRunFrame(PLAY, loop.controller, steps, DEFAULT_CUE_TOGGLES));
    scene.updateMatrixWorld();
    return { coverageIndex: loop.coverageIndex, drawItems: countDrawCalls(scene) };
  }
  return { view, frame };
}

describe('Horns Scrimmage frame', () => {
  it('a Horns Scrimmage frame renders under 100 draw items', () => {
    const { view, frame } = setup();
    const visited = new Set<number>();
    const maxFrames = (PLAY.coverages.length * PREVIEW_MAX_COVERAGE_STEPS) / STEPS_PER_FRAME + 10;
    let max = 0;
    let wrapped = false;
    for (let i = 0; i < maxFrames && !wrapped; i += 1) {
      const { coverageIndex, drawItems } = frame();
      max = Math.max(max, drawItems);
      visited.add(coverageIndex);
      wrapped = visited.size === PLAY.coverages.length && coverageIndex === 0;
    }
    expect(visited.size).toBe(PLAY.coverages.length);
    expect(max).toBeGreaterThan(40);
    expect(max, `max draw items ${max}`).toBeLessThan(100);
    view.dispose();
  });

  it('a Horns Scrimmage sim step plus render prep stays well inside a 30 FPS frame', () => {
    const { view, frame } = setup();
    for (let i = 0; i < 60; i += 1) frame();
    const samples: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const start = performance.now();
      frame();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] as number;
    const p90 = samples[Math.floor(samples.length * 0.9)] as number;
    expect(median, `median ${median.toFixed(2)} ms`).toBeLessThan(FRAME_MS / 4);
    expect(p90, `p90 ${p90.toFixed(2)} ms`).toBeLessThan(FRAME_MS / 2);
    view.dispose();
  });
});
