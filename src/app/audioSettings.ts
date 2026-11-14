// App layer: audio settings controller. Sole writer of settings.audio; pushes the stored volume and
// music/SFX toggles to an audio output (structural, so the app layer does not import src/audio).
import type { SaveStore, SettingsSection } from './storage';

export const AUDIO_VOLUME_RANGE = { min: 0, max: 1, step: 0.05 } as const;

/** Master gain at volume 1; keeps the engine's default master headroom. */
export const MASTER_HEADROOM = 0.8;

export interface AudioOutput {
  setVolume(bus: 'master' | 'sfx' | 'music', volume: number): void;
  setSfxEnabled(on: boolean): void;
  setMusicEnabled(on: boolean): void;
}

export type AudioSettingsValue = SettingsSection['audio'];

export interface AudioSettings {
  settings(): AudioSettingsValue;
  setVolume(v: number): void;
  setMusicOn(on: boolean): void;
  setSfxOn(on: boolean): void;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export interface AudioSettingsOptions {
  store: SaveStore;
  output?: AudioOutput;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Rounds to AUDIO_VOLUME_RANGE.step without float drift (0.37 -> 0.35, not 0.35000000000000003). */
function snapVolume(v: number): number {
  const perUnit = Math.round(1 / AUDIO_VOLUME_RANGE.step);
  return clamp(Math.round(v * perUnit) / perUnit, AUDIO_VOLUME_RANGE.min, AUDIO_VOLUME_RANGE.max);
}

export function createAudioSettings({ store, output }: AudioSettingsOptions): AudioSettings {
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const l of [...listeners]) l();
  };

  const apply = (): void => {
    if (!output) return;
    const { volume, musicOn, sfxOn } = store.get('settings').audio;
    output.setVolume('master', MASTER_HEADROOM * volume);
    output.setSfxEnabled(sfxOn);
    output.setMusicEnabled(musicOn);
  };

  const write = (patch: Partial<AudioSettingsValue>): void => {
    const settings = store.get('settings');
    store.set('settings', { ...settings, audio: { ...settings.audio, ...patch } });
    apply();
    notify();
  };

  apply();

  return {
    settings: () => store.get('settings').audio,
    setVolume(v) {
      if (!Number.isFinite(v)) return;
      write({ volume: snapVolume(v) });
    },
    setMusicOn(on) {
      write({ musicOn: on });
    },
    setSfxOn(on) {
      write({ sfxOn: on });
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      listeners.clear();
    },
  };
}
