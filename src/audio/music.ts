// Audio layer: procedural background music loop, pre-rendered into one mono buffer.
// The buffer is played with loop = true, so the loop point is sample exact as long as every note's
// envelope reaches 0 before the buffer ends (see renderMusicLoop).

import type { AudioBufferLike, AudioContextLike } from './types';

export const MUSIC_BPM = 100;
export const MUSIC_BARS = 4;
export const MUSIC_BEATS_PER_BAR = 4;
export const MUSIC_LOOP_S = (MUSIC_BARS * MUSIC_BEATS_PER_BAR * 60) / MUSIC_BPM;
export const MUSIC_PEAK = 0.35;

const BEAT_S = 60 / MUSIC_BPM;
const BAR_S = BEAT_S * MUSIC_BEATS_PER_BAR;
const PAD_GAIN = 0.07;
const BASS_GAIN = 0.12;

interface Chord {
  readonly padHz: readonly number[];
  readonly bassHz: number;
}

// Am - F - C - G, one bar each.
const PROGRESSION: readonly Chord[] = [
  { padHz: [220.0, 261.63, 329.63], bassHz: 110.0 },
  { padHz: [174.61, 220.0, 261.63], bassHz: 87.31 },
  { padHz: [196.0, 261.63, 329.63], bassHz: 130.81 },
  { padHz: [196.0, 246.94, 293.66], bassHz: 98.0 },
];

/** Pure, deterministic loop samples in [-1, 1]; length is exactly round(MUSIC_LOOP_S * sampleRate). */
export function renderMusicLoop(sampleRate: number): Float32Array {
  if (!(Number.isFinite(sampleRate) && sampleRate > 0)) {
    throw new Error(`Court Vision: music sample rate must be a positive finite number`);
  }
  const length = Math.round(MUSIC_LOOP_S * sampleRate);
  const data = new Float32Array(length);

  for (let bar = 0; bar < MUSIC_BARS; bar += 1) {
    const chord = PROGRESSION[bar % PROGRESSION.length]!;
    const barStart = bar * BAR_S;

    // Pad: raised-cosine window over the bar, so it is 0 at both ends of the slot.
    const padFrom = Math.round(barStart * sampleRate);
    const padTo = Math.min(length, Math.round((barStart + BAR_S) * sampleRate));
    for (let i = padFrom; i < padTo; i += 1) {
      const x = (i - padFrom) / (padTo - padFrom);
      const window = Math.sin(Math.PI * x) ** 2;
      const t = i / sampleRate;
      let sum = 0;
      for (const hz of chord.padHz) sum += Math.sin(2 * Math.PI * hz * t);
      data[i]! += PAD_GAIN * window * sum;
    }

    // Bass: a pluck on every beat; fast attack, exponential decay, tapered to 0 before the slot ends.
    for (let beat = 0; beat < MUSIC_BEATS_PER_BAR; beat += 1) {
      const noteStart = barStart + beat * BEAT_S;
      const from = Math.round(noteStart * sampleRate);
      const to = Math.min(length, Math.round((noteStart + BEAT_S) * sampleRate));
      const n = to - from;
      const attackSamples = Math.max(1, Math.round(0.01 * sampleRate));
      const taperSamples = Math.max(1, Math.round(0.05 * sampleRate));
      for (let i = from; i < to; i += 1) {
        const k = i - from;
        const sec = k / sampleRate;
        let env = Math.exp(-sec * 5);
        if (k < attackSamples) env *= k / attackSamples;
        const left = n - 1 - k;
        if (left < taperSamples) env *= left / taperSamples;
        const hz = beat % 2 === 0 ? chord.bassHz : chord.bassHz * 2;
        data[i]! += BASS_GAIN * env * Math.sin(2 * Math.PI * hz * (i / sampleRate));
      }
    }
  }

  // Clamp is only a safety net; the gains above already sum to <= MUSIC_PEAK.
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.max(-1, Math.min(1, data[i]!));
  }
  return data;
}

export function createMusicBuffer(ctx: AudioContextLike): AudioBufferLike {
  const samples = renderMusicLoop(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
