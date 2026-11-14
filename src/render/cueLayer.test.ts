import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Cue } from '../content';
import {
  CUE_FLOOR_Y_M,
  CUE_RING_PULSE_AMPLITUDE,
  CUE_RING_PULSE_PERIOD_S,
  createCueLayer,
  type CueLayerInput,
} from './cueLayer';

const offense = { SG: { x: 5.5, z: -1 }, PG: { x: 0, z: 2.5 } };
const arrowCue: Cue = { kind: 'floorArrow', to: { x: 0.8, z: -4 } };
const ringCue: Cue = { kind: 'targetRing', role: 'SG' };
const promptCue: Cue = { kind: 'prompt', text: 'Go' };

function input(
  cues: readonly Cue[],
  dtSec = 0,
  off: CueLayerInput['offense'] = offense,
): CueLayerInput {
  return { cues, offense: off, humanRole: 'PG', dtSec };
}

function find(layer: ReturnType<typeof createCueLayer>, name: string): THREE.Object3D {
  const found = layer.object.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}
function visibleCueObjects(layer: ReturnType<typeof createCueLayer>): string[] {
  return layer.object.children.filter((c) => c.visible).map((c) => c.name);
}

describe('createCueLayer', () => {
  it('places the arrow head exactly at the target', () => {
    const layer = createCueLayer();
    layer.sync(input([arrowCue]));
    layer.object.updateMatrixWorld(true);
    expect(find(layer, 'cue-floor-arrow-0').visible).toBe(true);
    const head = find(layer, 'cue-floor-arrow-head');
    const p = head.getWorldPosition(new THREE.Vector3());
    expect(p.x).toBeCloseTo(0.8, 6);
    expect(p.z).toBeCloseTo(-4, 6);
    expect(p.y).toBeCloseTo(CUE_FLOOR_Y_M, 6);
  });

  it('hides the arrow when the human is already at the target', () => {
    const layer = createCueLayer();
    layer.sync(input([arrowCue], 0, { PG: { x: 0.8, z: -3.9 } }));
    expect(find(layer, 'cue-floor-arrow-0').visible).toBe(false);
  });

  it('puts a pulsing ring under the target teammate', () => {
    const layer = createCueLayer();
    layer.sync(input([ringCue], 0));
    layer.object.updateMatrixWorld(true);
    const ring = find(layer, 'cue-target-ring-0') as THREE.Mesh;
    expect(ring.visible).toBe(true);
    const p = ring.getWorldPosition(new THREE.Vector3());
    expect(p.x).toBeCloseTo(5.5, 6);
    expect(p.z).toBeCloseTo(-1, 6);
    expect(ring.scale.x).toBeCloseTo(1, 6);
    layer.sync(input([ringCue], CUE_RING_PULSE_PERIOD_S / 4));
    expect(ring.scale.x).toBeCloseTo(1 + CUE_RING_PULSE_AMPLITUDE, 6);
    expect(ring.scale.y).toBe(1);
  });

  it('follows phase changes and hides everything for no cues', () => {
    const layer = createCueLayer();
    layer.sync(input([arrowCue]));
    layer.sync(input([ringCue]));
    expect(find(layer, 'cue-floor-arrow-0').visible).toBe(false);
    expect(find(layer, 'cue-target-ring-0').visible).toBe(true);
    layer.sync(input([]));
    expect(visibleCueObjects(layer)).toEqual([]);
  });

  it('grows the ring pool for several rings', () => {
    const layer = createCueLayer();
    layer.sync(input([ringCue, { kind: 'targetRing', role: 'PG' }]));
    expect(find(layer, 'cue-target-ring-0').visible).toBe(true);
    expect(find(layer, 'cue-target-ring-1').visible).toBe(true);
  });

  it('draws a spot marker at its spot', () => {
    const layer = createCueLayer();
    layer.sync(input([{ kind: 'spotMarker', spot: { x: 2, z: 3 } }]));
    layer.object.updateMatrixWorld(true);
    const spot = find(layer, 'cue-spot-marker-0');
    expect(spot.visible).toBe(true);
    const p = spot.getWorldPosition(new THREE.Vector3());
    expect(p.x).toBeCloseTo(2, 6);
    expect(p.z).toBeCloseTo(3, 6);
  });

  it('ignores prompts and rings for missing roles', () => {
    const layer = createCueLayer();
    expect(() => layer.sync(input([promptCue, { kind: 'targetRing', role: 'C' }]))).not.toThrow();
    expect(visibleCueObjects(layer)).toEqual([]);
  });

  it('keeps every cue mesh above the court lines and disposes cleanly', () => {
    const layer = createCueLayer();
    layer.sync(input([arrowCue, ringCue, { kind: 'spotMarker', spot: { x: 1, z: 1 } }]));
    layer.object.updateMatrixWorld(true);
    layer.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        expect(o.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(0.01);
      }
    });
    expect(() => layer.dispose()).not.toThrow();
  });
});
