import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBallLayer } from './ball';
import { countDrawCalls } from './drawCalls';
import { BALL_RADIUS_M } from './simInterpolation';

describe('createBallLayer', () => {
  it('builds a ball group with mesh, outline and shadow', () => {
    const layer = createBallLayer();
    expect(layer.object.name).toBe('ball');
    const mesh = layer.object.getObjectByName('ball-mesh') as THREE.Mesh;
    expect(mesh).toBeDefined();
    expect((mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(BALL_RADIUS_M);
    expect(layer.object.getObjectByName('ball-outline')).toBeDefined();
    expect(layer.object.getObjectByName('ball-shadow')).toBeDefined();
  });

  it('hides on null and places the mesh and shadow on sync', () => {
    const layer = createBallLayer();
    layer.sync(null);
    expect(layer.object.visible).toBe(false);
    layer.sync({ x: 1, y: 2, z: 3 });
    expect(layer.object.visible).toBe(true);
    const mesh = layer.object.getObjectByName('ball-mesh') as THREE.Mesh;
    const shadow = layer.object.getObjectByName('ball-shadow') as THREE.Mesh;
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(shadow.position.x).toBe(1);
    expect(shadow.position.y).toBeCloseTo(0.01, 9);
    expect(shadow.position.z).toBe(3);
  });

  it('stays within three draw calls and disposes cleanly', () => {
    const layer = createBallLayer();
    layer.sync({ x: 0, y: 1, z: 0 });
    expect(countDrawCalls(layer.object)).toBeLessThanOrEqual(3);
    expect(() => layer.dispose()).not.toThrow();
  });
});
