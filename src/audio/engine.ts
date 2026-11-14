// Audio layer: engine with master/sfx/music gains and a lazily created AudioContext.

import type { GameEventSink } from '../sim';
import { soundForEvent, type SoundId } from './eventSounds';
import { VOICES } from './sounds';
import { createMusicBuffer } from './music';
import { createSoundDirector, type SoundStep } from './soundDirector';
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  GainNodeLike,
} from './types';

export type AudioBus = 'master' | 'sfx' | 'music';

export const DEFAULT_VOLUMES: Readonly<Record<AudioBus, number>> = {
  master: 0.8,
  sfx: 1,
  music: 0.6,
};

export interface AudioEngine {
  unlock(): void;
  isStarted(): boolean;
  isRunning(): boolean;
  setVolume(bus: AudioBus, volume: number): void;
  getVolume(bus: AudioBus): number;
  play(sound: SoundId, delayS?: number): void;
  setSfxEnabled(on: boolean): void;
  setMusicEnabled(on: boolean): void;
  isMusicEnabled(): boolean;
  isMusicPlaying(): boolean;
  handleEvent: GameEventSink;
  handleStep(step: SoundStep): void;
  dispose(): void;
}

export const MUSIC_FADE_S = 0.05;

interface MusicLoop {
  readonly source: AudioBufferSourceNodeLike;
  readonly fade: GainNodeLike;
}

export interface CreateAudioEngineOptions {
  createContext: () => AudioContextLike;
  volumes?: Partial<Record<AudioBus, number>>;
}

function validateVolume(bus: AudioBus, v: number): void {
  if (!(Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error(`Court Vision: ${bus} volume must be a finite number in [0, 1], got ${v}`);
  }
}

export function createAudioEngine(options: CreateAudioEngineOptions): AudioEngine {
  const volumes: Record<AudioBus, number> = { ...DEFAULT_VOLUMES };
  for (const bus of ['master', 'sfx', 'music'] as const) {
    const v = options.volumes?.[bus];
    if (v !== undefined) {
      validateVolume(bus, v);
      volumes[bus] = v;
    }
  }

  let ctx: AudioContextLike | null = null;
  let buses: Record<AudioBus, GainNodeLike> | null = null;
  let unavailable = false;
  let disposed = false;
  let sfxEnabled = true;
  let musicEnabled = false;
  let musicBuffer: AudioBufferLike | null = null;
  let musicLoop: MusicLoop | null = null;
  const director = createSoundDirector();

  function startMusic(): void {
    if (ctx === null || buses === null || musicLoop !== null) return;
    musicBuffer ??= createMusicBuffer(ctx);
    const fade = ctx.createGain();
    fade.connect(buses.music);
    const source = ctx.createBufferSource();
    source.buffer = musicBuffer;
    source.loop = true;
    source.connect(fade);
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_S);
    source.start(now);
    musicLoop = { source, fade };
  }

  function stopMusic(): void {
    if (ctx === null || musicLoop === null) return;
    const { source, fade } = musicLoop;
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(1, now);
    fade.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_S);
    source.stop(now + MUSIC_FADE_S);
    musicLoop = null;
  }

  function unlock(): void {
    if (disposed || unavailable) return;
    if (ctx === null) {
      let created: AudioContextLike;
      try {
        created = options.createContext();
      } catch (err) {
        console.warn('Court Vision: audio unavailable', err);
        unavailable = true;
        return;
      }
      const master = created.createGain();
      master.connect(created.destination);
      const sfx = created.createGain();
      sfx.connect(master);
      const music = created.createGain();
      music.connect(master);
      master.gain.value = volumes.master;
      sfx.gain.value = volumes.sfx;
      music.gain.value = volumes.music;
      ctx = created;
      buses = { master, sfx, music };
      if (musicEnabled) startMusic();
    }
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => undefined);
    }
  }

  function setVolume(bus: AudioBus, volume: number): void {
    validateVolume(bus, volume);
    volumes[bus] = volume;
    if (buses !== null) buses[bus].gain.value = volume;
  }

  function play(sound: SoundId, delayS = 0): void {
    if (!(Number.isFinite(delayS) && delayS >= 0)) {
      throw new Error(`Court Vision: sound delay must be a finite number >= 0, got ${delayS}`);
    }
    if (disposed || ctx === null || buses === null || ctx.state !== 'running') return;
    if (!sfxEnabled || volumes.master === 0 || volumes.sfx === 0) return;
    VOICES[sound](ctx, buses.sfx, ctx.currentTime + delayS);
  }

  function setMusicEnabled(on: boolean): void {
    musicEnabled = on;
    if (disposed) return;
    if (on) startMusic();
    else stopMusic();
  }

  return {
    unlock,
    isStarted: () => ctx !== null,
    isRunning: () => ctx !== null && ctx.state === 'running',
    setVolume,
    getVolume: (bus) => volumes[bus],
    play,
    setSfxEnabled: (on) => {
      sfxEnabled = on;
    },
    setMusicEnabled,
    isMusicEnabled: () => musicEnabled,
    isMusicPlaying: () => musicLoop !== null,
    handleEvent: (event) => {
      const s = soundForEvent(event);
      if (s !== null) play(s);
    },
    handleStep: (step) => {
      for (const cue of director.observe(step)) play(cue.sound, cue.delayS);
    },
    dispose: () => {
      director.reset();
      if (disposed) return;
      stopMusic();
      disposed = true;
      const closing = ctx;
      ctx = null;
      buses = null;
      if (closing !== null) closing.close().catch(() => undefined);
    },
  };
}

// Compile-time proof that the real AudioContext satisfies AudioContextLike. Tests never call it.
export function createBrowserAudioContext(): AudioContextLike {
  return new AudioContext();
}
