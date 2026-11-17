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
  reduceMotion = false,
): CueLayerInput {
  return { cues, offense: off, humanRole: 'PG', dtSec, reduceMotion };
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

  it('keeps the ring static at scale 1 under reduce motion', () => {
    const layer = createCueLayer();
    for (let i = 0; i < 6; i++) {
      layer.sync(input([ringCue], 0.25, offense, true));
      const ring = find(layer, 'cue-target-ring-0') as THREE.Mesh;
      expect(ring.scale.x).toBe(1);
      expect(ring.scale.z).toBe(1);
    }
    const live = createCueLayer();
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) {
      live.sync(input([ringCue], 0.25, offense, false));
      seen.add((find(live, 'cue-target-ring-0') as THREE.Mesh).scale.x);
    }
    expect(seen.size).toBeGreaterThan(1);
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

describe('non-color channel', () => {
  const spotCue: Cue = { kind: 'spotMarker', spot: { x: 2, z: 3 } };
  function allVisible() {
    const layer = createCueLayer();
    layer.sync(input([arrowCue, ringCue, spotCue]));
    return layer;
  }

  it('tells the arrow apart by shape: a shaft plus a different head geometry', () => {
    const arrow = find(allVisible(), 'cue-floor-arrow-0');
    expect(arrow.visible).toBe(true);
    const meshes = arrow.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(meshes).toHaveLength(2);
    const shaft = find(allVisible(), 'cue-floor-arrow-shaft') as THREE.Mesh;
    const head = find(allVisible(), 'cue-floor-arrow-head') as THREE.Mesh;
    expect(head.geometry).not.toBe(shaft.geometry);
    expect(head.geometry.type).not.toBe(shaft.geometry.type);
  });

  it('tells the ring apart by shape: a RingGeometry', () => {
    const ring = find(allVisible(), 'cue-target-ring-0') as THREE.Mesh;
    expect(ring.visible).toBe(true);
    expect(ring.geometry).toBeInstanceOf(THREE.RingGeometry);
  });

  it('tells the spot apart by shape: a 4-segment diamond', () => {
    const spot = find(allVisible(), 'cue-spot-marker-0') as THREE.Mesh;
    expect(spot.visible).toBe(true);
    expect(spot.geometry).toBeInstanceOf(THREE.CircleGeometry);
    expect((spot.geometry as THREE.CircleGeometry).parameters.segments).toBe(4);
  });

  it('gives the three kinds pairwise different geometry', () => {
    const layer = allVisible();
    const head = (find(layer, 'cue-floor-arrow-head') as THREE.Mesh).geometry;
    const ring = (find(layer, 'cue-target-ring-0') as THREE.Mesh).geometry;
    const spot = (find(layer, 'cue-spot-marker-0') as THREE.Mesh).geometry;
    const types = [head.type, ring.type, spot.type];
    expect(new Set(types).size).toBe(3);
    expect(new Set([head, ring, spot]).size).toBe(3);
  });
});
