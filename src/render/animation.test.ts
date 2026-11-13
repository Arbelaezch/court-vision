import { describe, expect, it } from 'vitest';
import {
  ANIM_BLEND_S,
  ANIM_MAX_STEP_S,
  ANIM_MIN_CYCLE_SPEED_MPS,
  ANIM_STATES,
  createAnimator,
  locomotionCycleHz,
  neutralPose,
  resolveAnimState,
  samplePose,
  stepAnimator,
  type BodyPose,
} from './animation';

const KEYS = Object.keys(neutralPose()) as (keyof BodyPose)[];

function maxDiff(a: BodyPose, b: BodyPose): number {
  return Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
}

describe('animation states', () => {
  it('lists the 11 states without duplicates', () => {
    expect(ANIM_STATES).toHaveLength(11);
    expect(new Set(ANIM_STATES).size).toBe(11);
    expect([...ANIM_STATES]).toEqual([
      'idle',
      'run',
      'sprint',
      'dribble',
      'pass',
      'catch',
      'shoot',
      'layup',
      'screen',
      'celebrate',
      'disappointed',
    ]);
  });

  it('resolves the state from speed only when none is given', () => {
    expect(resolveAnimState(undefined, 0)).toBe('idle');
    expect(resolveAnimState(undefined, 2)).toBe('run');
    expect(resolveAnimState('shoot', 0)).toBe('shoot');
  });
});

describe('clips', () => {
  it('idle at phase 0 is the neutral pose', () => {
    expect(samplePose('idle', 0, neutralPose())).toEqual(neutralPose());
  });

  it.each(ANIM_STATES)('%s loops without a snap', (s) => {
    const a = samplePose(s, 0, neutralPose());
    const b = samplePose(s, 1 - 1e-6, neutralPose());
    expect(maxDiff(a, b)).toBeLessThan(1e-3);
  });

  it.each(ANIM_STATES)('%s moves over the cycle', (s) => {
    const poses = [0, 0.25, 0.5, 0.75].map((p) => samplePose(s, p, neutralPose()));
    expect(poses.some((p) => maxDiff(p, poses[0]!) > 1e-6)).toBe(true);
  });

  it.each(ANIM_STATES)('%s stays within crouch and jump bounds', (s) => {
    for (let i = 0; i <= 20; i++) {
      const pose = samplePose(s, i * 0.05, neutralPose());
      expect(pose.crouchM).toBeGreaterThanOrEqual(0);
      expect(pose.crouchM).toBeLessThanOrEqual(0.15);
      expect(pose.jumpM).toBeGreaterThanOrEqual(0);
      expect(pose.jumpM).toBeLessThanOrEqual(0.45);
    }
  });
});

describe('locomotion pacing', () => {
  it('scales cycle rate with speed and sprint outpaces run', () => {
    expect(locomotionCycleHz('run', 6)).toBeCloseTo(2 * locomotionCycleHz('run', 3), 9);
    expect(locomotionCycleHz('sprint', 8)).toBeGreaterThan(locomotionCycleHz('run', 6));
  });

  it('floors the rate at slow speeds', () => {
    const floor = locomotionCycleHz('run', ANIM_MIN_CYCLE_SPEED_MPS);
    expect(locomotionCycleHz('run', 0.2)).toBe(floor);
    expect(floor).toBeGreaterThan(0);
  });

  it('advances the phase twice as far at twice the speed', () => {
    const slow = createAnimator('run');
    const fast = createAnimator('run');
    for (let i = 0; i < 10; i++) {
      stepAnimator(slow, 'run', 3, 0.02);
      stepAnimator(fast, 'run', 6, 0.02);
    }
    expect(fast.locomotionPhase).toBeCloseTo(2 * slow.locomotionPhase, 9);
  });
});

describe('animator blending', () => {
  const pairs: [(typeof ANIM_STATES)[number], (typeof ANIM_STATES)[number]][] = [];
  for (const a of ANIM_STATES) for (const b of ANIM_STATES) if (a !== b) pairs.push([a, b]);

  it.each(pairs)('%s -> %s blends without a snap or freeze', (a, b) => {
    const anim = createAnimator(a);
    for (let i = 0; i < 30; i++) stepAnimator(anim, a, 5, 1 / 60);
    const before = { ...anim.current };
    const switched = stepAnimator(anim, b, 5, 0);
    expect(maxDiff(switched, before)).toBeLessThan(1e-9);

    let prev = { ...switched };
    for (let i = 0; i < 5; i++) {
      const next = stepAnimator(anim, b, 5, 1 / 60);
      expect(maxDiff(next, prev)).toBeGreaterThan(0);
      prev = { ...next };
    }
    for (let i = 0; i < 20; i++) stepAnimator(anim, b, 5, 1 / 60);
    expect(anim.blendElapsedS).toBeGreaterThanOrEqual(ANIM_BLEND_S);
    expect(maxDiff(anim.current, anim.target)).toBeLessThan(1e-9);
  });

  it('re-switching mid-blend does not snap', () => {
    const anim = createAnimator('idle');
    stepAnimator(anim, 'shoot', 0, 0);
    for (let i = 0; i < 6; i++) stepAnimator(anim, 'shoot', 0, 1 / 60);
    const before = { ...anim.current };
    expect(maxDiff(stepAnimator(anim, 'celebrate', 0, 0), before)).toBeLessThan(1e-9);
  });

  it('clamps the time step', () => {
    const anim = createAnimator('idle');
    stepAnimator(anim, 'idle', 0, 5);
    expect(anim.stateTimeS).toBeCloseTo(ANIM_MAX_STEP_S, 12);
    const nan = createAnimator('idle');
    stepAnimator(nan, 'idle', 0, Number.NaN);
    expect(nan.stateTimeS).toBe(0);
  });
});
