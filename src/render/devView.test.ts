import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadCastContent } from '../content';
import { BASELINE_Z, HALF_COURT_LINE_Z, SIDELINE_X } from '../sim';
import { characterFitHeight } from './characters';
import { createDevScene, parseDevView } from './devView';
import type { DevView } from './devView';
import { countDrawCalls } from './drawCalls';

function build(view: DevView): ReturnType<typeof createDevScene> {
  return createDevScene(view, { labelTexture: new THREE.Texture() });
}

function names(scene: THREE.Scene): string[] {
  const out: string[] = [];
  scene.traverse((o) => out.push(o.name));
  return out;
}

describe('parseDevView', () => {
  it('accepts exact view names only', () => {
    expect(parseDevView('characters')).toBe('characters');
    expect(parseDevView('practice')).toBe('practice');
    expect(parseDevView(null)).toBeNull();
    expect(parseDevView('x')).toBeNull();
  });
});

describe('createDevScene', () => {
  it('characters view holds all ten players and a marker', () => {
    const { scene } = build('characters');
    const all = names(scene);
    expect(all).toContain('characters');
    expect(all).toContain('court-markings');
    expect(all).toContain('controlled-marker');
    expect(all.filter((n) => n.startsWith('jersey-'))).toHaveLength(10);
    expect(all).not.toContain('practice-cones');
  });

  it('practice view holds offense players and five cones', () => {
    const { scene } = build('practice');
    const cones = scene.getObjectByName('practice-cones');
    expect(cones).toBeDefined();
    expect(cones?.children.filter((c) => c.name.startsWith('cone-label-'))).toHaveLength(5);
    const bodies = cones?.getObjectByName('cone-bodies') as THREE.InstancedMesh;
    expect(bodies.count).toBe(5);
    expect(names(scene).filter((n) => n.startsWith('jersey-'))).toHaveLength(5);
  });

  it.each<DevView>(['characters', 'practice'])('%s stays under the draw call budget', (view) => {
    expect(countDrawCalls(build(view).scene)).toBeLessThan(100);
  });

  it.each<DevView>(['characters', 'practice'])('%s fits the marker top in view', (view) => {
    const { scene, camera, topHeight } = build(view);
    expect(topHeight).toBe(characterFitHeight(loadCastContent().bodyTypes));
    scene.updateMatrixWorld(true);
    const marker = scene.getObjectByName('controlled-marker') as THREE.Object3D;
    const y = marker.getWorldPosition(new THREE.Vector3()).y + 0.2;
    for (const x of [-SIDELINE_X, SIDELINE_X]) {
      for (const z of [BASELINE_Z, HALF_COURT_LINE_Z]) {
        const ndc = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each<DevView>(['characters', 'practice'])('%s disposes cleanly', (view) => {
    expect(() => build(view).dispose()).not.toThrow();
  });
});
