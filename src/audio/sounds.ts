// Audio layer: procedural voices (no sound files). Each voice starts exactly at `t`.

import type { SoundId } from './eventSounds';
import type { AudioBufferLike, AudioContextLike, AudioNodeLike } from './types';

export type Voice = (ctx: AudioContextLike, out: AudioNodeLike, t: number) => void;

export const WHISTLE_DURATION_S = 0.45;
export const WHISTLE_TRILL_STEP_S = 0.03;
export const WHISTLE_LOW_HZ = 2800;
export const WHISTLE_HIGH_HZ = 3150;
export const WHISTLE_PEAK_GAIN = 0.3;

export const CHIME_NOTES_HZ: readonly number[] = [1046.5, 1318.5];
export const CHIME_NOTE_GAP_S = 0.09;
export const CHIME_PEAK_GAIN = 0.25;
export const CHIME_DECAY_S = 0.5;

export const playWhistle: Voice = (ctx, out, t) => {
  const env = ctx.createGain();
  env.connect(out);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.connect(env);

  const end = t + WHISTLE_DURATION_S;
  let high = false;
  for (let s = 0; s < WHISTLE_DURATION_S - 1e-9; s += WHISTLE_TRILL_STEP_S) {
    osc.frequency.setValueAtTime(high ? WHISTLE_HIGH_HZ : WHISTLE_LOW_HZ, t + s);
    high = !high;
  }

  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(WHISTLE_PEAK_GAIN, t + 0.01);
  env.gain.setValueAtTime(WHISTLE_PEAK_GAIN, end - 0.05);
  env.gain.linearRampToValueAtTime(0, end);

  osc.start(t);
  osc.stop(end + 0.02);
};

export const playChime: Voice = (ctx, out, t) => {
  CHIME_NOTES_HZ.forEach((hz, i) => {
    const start = t + i * CHIME_NOTE_GAP_S;
    const env = ctx.createGain();
    env.connect(out);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, start);
    osc.connect(env);

    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(CHIME_PEAK_GAIN, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + CHIME_DECAY_S);

    osc.start(start);
    osc.stop(start + CHIME_DECAY_S + 0.02);
  });
};

// Peak gains and durations for the short effect voices (exported for tests).
export const DRIBBLE_PEAK_GAIN = 0.5;
export const DRIBBLE_DURATION_S = 0.12;
export const PASS_CHEST_PEAK_GAIN = 0.4;
export const PASS_CHEST_DURATION_S = 0.1;
export const PASS_BOUNCE_GAP_S = 0.12;
export const PASS_BOUNCE_PEAK_GAIN = 0.4;
export const PASS_BOUNCE_DURATION_S = 0.1;
export const PASS_LOB_PEAK_GAIN = 0.25;
export const PASS_LOB_DURATION_S = 0.35;
export const CATCH_PEAK_GAIN = 0.35;
export const CATCH_DURATION_S = 0.08;
export const SHOT_RELEASE_PEAK_GAIN = 0.2;
export const SHOT_RELEASE_DURATION_S = 0.12;
export const SWISH_PEAK_GAIN = 0.3;
export const SWISH_DURATION_S = 0.45;
export const RIM_HIT_PEAK_GAIN = 0.3;
export const RIM_HIT_DURATION_S = 0.6;
export const RIM_HIT_HZ = 600;
export const SCREEN_CONTACT_PEAK_GAIN = 0.45;
export const SCREEN_CONTACT_DURATION_S = 0.18;
export const FOOTSTEP_PEAK_GAIN = 0.15;
export const FOOTSTEP_DURATION_S = 0.05;
export const UI_CLICK_PEAK_GAIN = 0.15;
export const UI_CLICK_DURATION_S = 0.015;

const NOISE_SECONDS = 0.5;
const NOISE_SEED = 0x2f6e2b1;
const noiseBuffers = new WeakMap<AudioContextLike, AudioBufferLike>();

// Deterministic white noise from a small LCG (never Math.random), in [-1, 1).
export function renderNoise(length: number): Float32Array {
  const data = new Float32Array(length);
  let state = NOISE_SEED;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = (state / 0x100000000) * 2 - 1;
  }
  return data;
}

function noiseBuffer(ctx: AudioContextLike): AudioBufferLike {
  let buf = noiseBuffers.get(ctx);
  if (buf === undefined) {
    const length = Math.max(1, Math.round(NOISE_SECONDS * ctx.sampleRate));
    buf = ctx.createBuffer(1, length, ctx.sampleRate);
    buf.getChannelData(0).set(renderNoise(length));
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

interface ToneSpec {
  type: OscillatorType;
  fromHz: number;
  toHz?: number;
  peak: number;
  duration: number;
  attack?: number;
}

// One oscillator through its own envelope: fast attack, exponential decay, optional pitch glide.
function tone(ctx: AudioContextLike, out: AudioNodeLike, start: number, spec: ToneSpec): void {
  const attack = spec.attack ?? 0.004;
  const env = ctx.createGain();
  env.connect(out);
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.fromHz, start);
  if (spec.toHz !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(spec.toHz, start + spec.duration);
  }
  osc.connect(env);
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(spec.peak, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration);
  osc.start(start);
  osc.stop(start + spec.duration + 0.02);
}

function noiseBurst(
  ctx: AudioContextLike,
  out: AudioNodeLike,
  start: number,
  peak: number,
  duration: number,
  attack: number,
): void {
  const env = ctx.createGain();
  env.connect(out);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = false;
  src.connect(env);
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.start(start);
  src.stop(start + duration + 0.02);
}

export const playDribble: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 140,
    toHz: 50,
    peak: DRIBBLE_PEAK_GAIN,
    duration: DRIBBLE_DURATION_S,
  });
};

export const playPassChest: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'triangle',
    fromHz: 420,
    toHz: 180,
    peak: PASS_CHEST_PEAK_GAIN,
    duration: PASS_CHEST_DURATION_S,
  });
  noiseBurst(ctx, out, t, PASS_CHEST_PEAK_GAIN * 0.4, 0.04, 0.002);
};

export const playPassBounce: Voice = (ctx, out, t) => {
  for (const offset of [0, PASS_BOUNCE_GAP_S]) {
    tone(ctx, out, t + offset, {
      type: 'sine',
      fromHz: 160,
      toHz: 60,
      peak: PASS_BOUNCE_PEAK_GAIN,
      duration: PASS_BOUNCE_DURATION_S,
    });
  }
};

export const playPassLob: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 260,
    toHz: 520,
    peak: PASS_LOB_PEAK_GAIN,
    duration: PASS_LOB_DURATION_S,
    attack: 0.03,
  });
};

export const playCatch: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'square',
    fromHz: 300,
    toHz: 150,
    peak: CATCH_PEAK_GAIN * 0.5,
    duration: CATCH_DURATION_S,
    attack: 0.002,
  });
  noiseBurst(ctx, out, t, CATCH_PEAK_GAIN, CATCH_DURATION_S, 0.002);
};

export const playShotRelease: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 500,
    toHz: 900,
    peak: SHOT_RELEASE_PEAK_GAIN,
    duration: SHOT_RELEASE_DURATION_S,
    attack: 0.01,
  });
};

export const playSwish: Voice = (ctx, out, t) => {
  noiseBurst(ctx, out, t, SWISH_PEAK_GAIN, SWISH_DURATION_S, 0.06);
};

export const playRimHit: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'triangle',
    fromHz: RIM_HIT_HZ,
    peak: RIM_HIT_PEAK_GAIN,
    duration: RIM_HIT_DURATION_S,
    attack: 0.002,
  });
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: RIM_HIT_HZ * 2.76,
    peak: RIM_HIT_PEAK_GAIN * 0.5,
    duration: RIM_HIT_DURATION_S * 0.6,
    attack: 0.002,
  });
};

export const playScreenContact: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 110,
    toHz: 45,
    peak: SCREEN_CONTACT_PEAK_GAIN,
    duration: SCREEN_CONTACT_DURATION_S,
    attack: 0.006,
  });
};

export const playFootstep: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 180,
    toHz: 90,
    peak: FOOTSTEP_PEAK_GAIN,
    duration: FOOTSTEP_DURATION_S,
    attack: 0.002,
  });
};

export const playUiClick: Voice = (ctx, out, t) => {
  tone(ctx, out, t, {
    type: 'sine',
    fromHz: 1800,
    peak: UI_CLICK_PEAK_GAIN,
    duration: UI_CLICK_DURATION_S,
    attack: 0.002,
  });
};

export const VOICES: Readonly<Record<SoundId, Voice>> = {
  whistle: playWhistle,
  chime: playChime,
  dribble: playDribble,
  passChest: playPassChest,
  passBounce: playPassBounce,
  passLob: playPassLob,
  catch: playCatch,
  shotRelease: playShotRelease,
  swish: playSwish,
  rimHit: playRimHit,
  screenContact: playScreenContact,
  footstep: playFootstep,
  uiClick: playUiClick,
};
