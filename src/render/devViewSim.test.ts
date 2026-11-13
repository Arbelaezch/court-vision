import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../sim';
import { recordDevTimeline } from './devTimeline';
import { createDevScene, parseDevView } from './devView';
import { countDrawCalls } from './drawCalls';
import { SIM_PLAYBACK_LOOP_HOLD_S } from './simPlayback';

const states = recordDevTimeline();

function build(simStates = states): ReturnType<typeof createDevScene> {
  return createDevScene('sim', { labelTexture: new THREE.Texture(), simStates });
}

function names(scene: THREE.Scene): string[] {
  const out: string[] = [];
  scene.traverse((o) => out.push(o.name));
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('sim dev view', () => {
  it('is a valid dev view', () => {
    expect(parseDevView('sim')).toBe('sim');
  });

  it('holds ten players, a ball and the controlled marker', () => {
    const { scene } = build();
    const all = names(scene);
    expect(all.filter((n) => n.startsWith('jersey-'))).toHaveLength(10);
    expect(all).toContain('ball');
    expect(all).toContain('controlled-marker');
    expect(all).not.toContain('practice-cones');
  });

  it('stays under the draw call budget and disposes cleanly', () => {
    const view = build();
    expect(countDrawCalls(view.scene)).toBeLessThan(100);
    expect(() => view.dispose()).not.toThrow();
  });

  it('reports the controlled player anim states in order while playing', () => {
    const { update, status } = build();
    const seen: string[] = [];
    for (let i = 0; i < states.length + 5; i++) {
      update(1 / 60);
      const s = status();
      if (s && seen[seen.length - 1] !== s) seen.push(s);
    }
    const order = ['dribble', 'pass', 'sprint', 'catch', 'shoot'];
    let at = -1;
    for (const want of order) {
      const idx = seen.indexOf(want, at + 1);
      expect(idx, `${want} in ${seen.join(',')}`).toBeGreaterThan(at);
      at = idx;
    }
  });

  it('moves the ball every frame while the pass is in flight', () => {
    const release = states.findIndex((s, i) => i > 0 && s.ball.kind === 'inFlight');
    const catchTick = states.findIndex((s, i) => i > release && s.ball.kind === 'held');
    const { scene, update } = build();
    const mesh = scene.getObjectByName('ball-mesh') as THREE.Object3D;
    const at = new THREE.Vector3();
    let before = new THREE.Vector3();
    for (let i = 1; i <= catchTick; i++) {
      update(1 / 60);
      scene.updateMatrixWorld(true);
      mesh.getWorldPosition(at);
      if (i > release + 1 && i < catchTick - 1) expect(at.equals(before)).toBe(false);
      before = at.clone();
    }
  });

  it('never writes to the sim states, including across a loop restart', () => {
    const frozen = recordDevTimeline().map((s) => deepFreeze(s));
    const snapshot = JSON.stringify(frozen);
    const { update } = build(frozen);
    const frames = Math.ceil((frozen.length / SIM_HZ + SIM_PLAYBACK_LOOP_HOLD_S + 0.5) * 144);
    expect(() => {
      for (let i = 0; i < frames; i++) update(1 / 144);
    }).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });
});
