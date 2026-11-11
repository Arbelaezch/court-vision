// Audio layer: engine with master/sfx/music gains and a lazily created AudioContext.

import type { GameEventSink } from '../sim';
import { soundForEvent, type SoundId } from './eventSounds';
import { VOICES } from './sounds';
import type { AudioContextLike, GainNodeLike } from './types';

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
  play(sound: SoundId): void;
  handleEvent: GameEventSink;
  dispose(): void;
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

  function play(sound: SoundId): void {
    if (disposed || ctx === null || buses === null || ctx.state !== 'running') return;
    if (volumes.master === 0 || volumes.sfx === 0) return;
    VOICES[sound](ctx, buses.sfx, ctx.currentTime);
  }

  return {
    unlock,
    isStarted: () => ctx !== null,
    isRunning: () => ctx !== null && ctx.state === 'running',
    setVolume,
    getVolume: (bus) => volumes[bus],
    play,
    handleEvent: (event) => {
      const s = soundForEvent(event);
      if (s !== null) play(s);
    },
    dispose: () => {
      if (disposed) return;
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
