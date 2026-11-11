// Audio layer: procedural voices (no sound files). Each voice starts exactly at `t`.

import type { SoundId } from './eventSounds';
import type { AudioContextLike, AudioNodeLike } from './types';

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

export const VOICES: Readonly<Record<SoundId, Voice>> = {
  whistle: playWhistle,
  chime: playChime,
};
