// Procedural character animation: a pure pose module (no three.js, no DOM). An animation state plus
// speed selects a clip; clips are functions of phase that write a flat set of joint angles and
// offsets; a small per-character animator advances clocks and cross-fades between states.

export const ANIM_STATES = [
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
] as const;
export type AnimState = (typeof ANIM_STATES)[number];

// Above this speed an unspecified state resolves to running instead of idle.
export const MOVING_SPEED_MPS = 0.1;
// Cross-fade duration when the animation state changes.
export const ANIM_BLEND_S = 0.25;
// Largest time step the animator accepts, so a stalled frame can't jump a clip.
export const ANIM_MAX_STEP_S = 0.1;
// Distance covered by one full two-step cycle.
export const RUN_STRIDE_M = 2.4;
export const SPRINT_STRIDE_M = 2.8;
// Slowest speed the locomotion cycle is paced by, so slow jogs still visibly step.
export const ANIM_MIN_CYCLE_SPEED_MPS = 1.5;
// Seconds per loop of each non-locomotion clip.
export const ANIM_CLIP_PERIOD_S: Record<Exclude<AnimState, 'run' | 'sprint'>, number> = {
  idle: 3,
  dribble: 0.5,
  pass: 0.9,
  catch: 0.9,
  shoot: 1.4,
  layup: 1.3,
  screen: 2,
  celebrate: 0.8,
  disappointed: 2.5,
};

export interface BodyPose {
  jumpM: number; // whole body lift, >= 0
  crouchM: number; // hip drop with legs shortened by the same amount, 0..0.15
  torsoPitchRad: number; // extra forward lean on top of the body-type lean, + = forward
  legRSwingRad: number;
  legLSwingRad: number; // + = foot forward
  legRSpreadRad: number;
  legLSpreadRad: number; // + = foot outward
  armRSwingRad: number;
  armLSwingRad: number; // + = hand forward/up (PI = straight overhead)
  armRSpreadRad: number;
  armLSpreadRad: number; // + = hand outward, - = across the body
}

const POSE_KEYS: readonly (keyof BodyPose)[] = [
  'jumpM',
  'crouchM',
  'torsoPitchRad',
  'legRSwingRad',
  'legLSwingRad',
  'legRSpreadRad',
  'legLSpreadRad',
  'armRSwingRad',
  'armLSwingRad',
  'armRSpreadRad',
  'armLSpreadRad',
];

export function neutralPose(): BodyPose {
  return {
    jumpM: 0,
    crouchM: 0,
    torsoPitchRad: 0,
    legRSwingRad: 0,
    legLSwingRad: 0,
    legRSpreadRad: 0,
    legLSpreadRad: 0,
    armRSwingRad: 0,
    armLSwingRad: 0,
    armRSpreadRad: 0,
    armLSpreadRad: 0,
  };
}

function resetPose(out: BodyPose): void {
  for (const k of POSE_KEYS) out[k] = 0;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function resolveAnimState(state: AnimState | undefined, speedMps: number): AnimState {
  if (state !== undefined) return state;
  return speedMps > MOVING_SPEED_MPS ? 'run' : 'idle';
}

export function locomotionCycleHz(state: 'run' | 'sprint', speedMps: number): number {
  const strideM = state === 'sprint' ? SPRINT_STRIDE_M : RUN_STRIDE_M;
  return Math.max(speedMps, ANIM_MIN_CYCLE_SPEED_MPS) / strideM;
}

type Keyframe = readonly [number, Partial<BodyPose>];

// Interpolates an ordered keyframe list (first and last frames equal, so the clip loops) with
// smoothstep easing between neighbours. Fields a frame omits are 0.
function sampleKeys(frames: readonly Keyframe[], p: number, out: BodyPose): void {
  let i = 0;
  while (i < frames.length - 2 && p >= frames[i + 1]![0]) i++;
  const [p0, a] = frames[i]!;
  const [p1, b] = frames[i + 1]!;
  const t = smoothstep((p - p0) / (p1 - p0));
  for (const k of POSE_KEYS) {
    const from = a[k] ?? 0;
    const to = b[k] ?? 0;
    out[k] = from + (to - from) * t;
  }
}

const PASS_KEYS: readonly Keyframe[] = [
  [0, { armRSwingRad: 0.4, armLSwingRad: 0.4 }],
  [0.35, { armRSwingRad: 0.9, armLSwingRad: 0.9, armRSpreadRad: 0.2, armLSpreadRad: 0.2 }],
  [0.55, { armRSwingRad: 1.5, armLSwingRad: 1.5, legRSwingRad: 0.3 }],
  [0.75, { armRSwingRad: 1.4, armLSwingRad: 1.4, legRSwingRad: 0.3 }],
  [1, { armRSwingRad: 0.4, armLSwingRad: 0.4 }],
];

const CATCH_KEYS: readonly Keyframe[] = [
  [0, { armRSwingRad: 0.3, armLSwingRad: 0.3 }],
  [0.35, { armRSwingRad: 1.4, armLSwingRad: 1.4, armRSpreadRad: 0.2, armLSpreadRad: 0.2 }],
  [0.65, { armRSwingRad: 0.8, armLSwingRad: 0.8, crouchM: 0.03 }],
  [1, { armRSwingRad: 0.3, armLSwingRad: 0.3 }],
];

const SHOOT_KEYS: readonly Keyframe[] = [
  [0, {}],
  [0.2, { crouchM: 0.12, armRSwingRad: 0.9, armLSwingRad: 0.9 }],
  [0.45, { jumpM: 0.35, armRSwingRad: 2.9, armLSwingRad: 2.6, torsoPitchRad: -0.05 }],
  [0.65, { jumpM: 0.25, armRSwingRad: 2.9, armLSwingRad: 2.3 }],
  [0.85, { crouchM: 0.06, armRSwingRad: 1.2, armLSwingRad: 0.8 }],
  [1, {}],
];

const LAYUP_KEYS: readonly Keyframe[] = [
  [0, {}],
  [0.2, { crouchM: 0.08, armRSwingRad: 0.8, armLSwingRad: 0.8 }],
  [0.5, { jumpM: 0.45, legLSwingRad: 1.2, armRSwingRad: 3.0, armLSwingRad: 1.2 }],
  [0.7, { jumpM: 0.3, legLSwingRad: 0.6, armRSwingRad: 2.8, armLSwingRad: 0.8 }],
  [0.9, { crouchM: 0.05, armRSwingRad: 1.0 }],
  [1, {}],
];

// Writes the clip for `state` at `phase` (in cycles, wraps mod 1) into `out` and returns it.
export function samplePose(state: AnimState, phase: number, out: BodyPose): BodyPose {
  resetPose(out);
  const p = phase - Math.floor(phase);
  const phi = 2 * Math.PI * p;
  switch (state) {
    case 'idle':
      out.crouchM = (0.015 * (1 - Math.cos(phi))) / 2;
      out.armRSwingRad = 0.04 * Math.sin(phi);
      out.armLSwingRad = 0 - 0.04 * Math.sin(phi);
      out.torsoPitchRad = 0.02 * Math.sin(phi);
      break;
    case 'run':
    case 'sprint': {
      const sprint = state === 'sprint';
      const leg = sprint ? 0.8 : 0.55;
      const arm = sprint ? 0.9 : 0.6;
      out.legRSwingRad = leg * Math.sin(phi);
      out.legLSwingRad = -leg * Math.sin(phi);
      out.armRSwingRad = -arm * Math.sin(phi);
      out.armLSwingRad = arm * Math.sin(phi);
      out.torsoPitchRad = sprint ? 0.25 : 0.12;
      out.crouchM = ((sprint ? 0.06 : 0.04) * (1 - Math.cos(2 * phi))) / 2;
      break;
    }
    case 'dribble':
      out.crouchM = 0.1;
      out.torsoPitchRad = 0.2;
      out.armRSwingRad = 0.5 + 0.35 * Math.sin(phi);
      out.armRSpreadRad = 0.15;
      out.armLSwingRad = 0.6;
      out.armLSpreadRad = 0.3;
      out.legRSpreadRad = 0.12;
      out.legLSpreadRad = 0.12;
      break;
    case 'pass':
      sampleKeys(PASS_KEYS, p, out);
      break;
    case 'catch':
      sampleKeys(CATCH_KEYS, p, out);
      break;
    case 'shoot':
      sampleKeys(SHOOT_KEYS, p, out);
      break;
    case 'layup':
      sampleKeys(LAYUP_KEYS, p, out);
      break;
    case 'screen': {
      const pulse = Math.sin(phi);
      out.crouchM = 0.08 + 0.01 * pulse;
      out.legRSpreadRad = 0.25;
      out.legLSpreadRad = 0.25;
      out.armRSwingRad = 1.1;
      out.armLSwingRad = 1.1;
      out.armRSpreadRad = -0.45 + 0.05 * pulse;
      out.armLSpreadRad = -0.45 + 0.05 * pulse;
      break;
    }
    case 'celebrate': {
      const swing = Math.PI - 0.25 + 0.25 * Math.sin(phi);
      out.armRSwingRad = swing;
      out.armLSwingRad = swing;
      out.armRSpreadRad = 0.35;
      out.armLSpreadRad = 0.35;
      out.jumpM = 0.12 * Math.max(0, Math.sin(phi));
      break;
    }
    case 'disappointed':
      out.torsoPitchRad = 0.45 + 0.05 * Math.sin(phi);
      out.crouchM = 0.03;
      out.armRSwingRad = -0.1 + 0.05 * Math.sin(phi);
      out.armLSwingRad = -0.1 - 0.05 * Math.sin(phi);
      break;
  }
  return out;
}

export interface Animator {
  state: AnimState;
  locomotionPhase: number;
  stateTimeS: number;
  blendElapsedS: number;
  from: BodyPose;
  target: BodyPose;
  current: BodyPose;
}

// A fully blended animator already showing the start of `state`'s clip.
export function createAnimator(state: AnimState): Animator {
  return {
    state,
    locomotionPhase: 0,
    stateTimeS: 0,
    blendElapsedS: ANIM_BLEND_S,
    from: samplePose(state, 0, neutralPose()),
    target: samplePose(state, 0, neutralPose()),
    current: samplePose(state, 0, neutralPose()),
  };
}

// Advances the animator by dtSec (clamped) toward `state` and returns the displayed pose.
export function stepAnimator(
  a: Animator,
  state: AnimState,
  speedMps: number,
  dtSec: number,
): BodyPose {
  const dt = Number.isNaN(dtSec) ? 0 : Math.min(ANIM_MAX_STEP_S, Math.max(0, dtSec));
  if (state !== a.state) {
    for (const k of POSE_KEYS) a.from[k] = a.current[k];
    a.state = state;
    a.stateTimeS = 0;
    a.blendElapsedS = 0;
  }
  a.stateTimeS += dt;
  a.blendElapsedS += dt;
  let phase: number;
  if (state === 'run' || state === 'sprint') {
    a.locomotionPhase = (a.locomotionPhase + dt * locomotionCycleHz(state, speedMps)) % 1;
    phase = a.locomotionPhase;
  } else {
    phase = a.stateTimeS / ANIM_CLIP_PERIOD_S[state];
  }
  samplePose(state, phase, a.target);
  const w = smoothstep(a.blendElapsedS / ANIM_BLEND_S);
  for (const k of POSE_KEYS) a.current[k] = a.from[k] + (a.target[k] - a.from[k]) * w;
  return a.current;
}
