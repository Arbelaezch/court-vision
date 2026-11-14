import { describe, expect, it, vi } from 'vitest';
import * as app from '.';
import {
  AUDIO_VOLUME_RANGE,
  MASTER_HEADROOM,
  createAudioSettings,
  type AudioOutput,
} from './audioSettings';
import { createFakeStorage } from './storage/fakeStorage';
import { createSaveStore } from './storage';

type OutputCall =
  | ['setVolume', 'master' | 'sfx' | 'music', number]
  | ['setSfxEnabled', boolean]
  | ['setMusicEnabled', boolean];

function recordingOutput(): AudioOutput & { calls: OutputCall[] } {
  const calls: OutputCall[] = [];
  return {
    calls,
    setVolume: (bus, volume) => calls.push(['setVolume', bus, volume]),
    setSfxEnabled: (on) => calls.push(['setSfxEnabled', on]),
    setMusicEnabled: (on) => calls.push(['setMusicEnabled', on]),
  };
}

function setup(storage = createFakeStorage()) {
  const store = createSaveStore({ storage, warn: vi.fn() });
  const output = recordingOutput();
  const audio = createAudioSettings({ store, output });
  return { storage, store, output, audio };
}

describe('createAudioSettings', () => {
  it('applies the stored defaults on creation: master 0.8, sfx on, music off', () => {
    const { output, audio } = setup();
    expect(MASTER_HEADROOM).toBe(0.8);
    expect(output.calls).toEqual([
      ['setVolume', 'master', 0.8],
      ['setSfxEnabled', true],
      ['setMusicEnabled', false],
    ]);
    expect(audio.settings()).toEqual({ volume: 1, musicOn: false, sfxOn: true });
  });

  it('applies stored non-default settings on creation', () => {
    const storage = createFakeStorage();
    const first = setup(storage);
    first.audio.setVolume(0.5);
    first.audio.setMusicOn(true);
    first.audio.setSfxOn(false);
    const { output } = setup(storage);
    expect(output.calls).toEqual([
      ['setVolume', 'master', MASTER_HEADROOM * 0.5],
      ['setSfxEnabled', false],
      ['setMusicEnabled', true],
    ]);
  });

  it('setMusicOn(true) persists and enables music on the output', () => {
    const { storage, store, output, audio } = setup();
    output.calls.length = 0;
    audio.setMusicOn(true);
    expect(store.get('settings').audio.musicOn).toBe(true);
    expect(audio.settings().musicOn).toBe(true);
    expect(output.calls).toContainEqual(['setMusicEnabled', true]);
    expect(createSaveStore({ storage, warn: vi.fn() }).get('settings').audio.musicOn).toBe(true);
  });

  it('setVolume rounds to the step and scales the master gain', () => {
    const { store, output, audio } = setup();
    output.calls.length = 0;
    audio.setVolume(0.37);
    expect(store.get('settings').audio.volume).toBe(0.35);
    const master = output.calls.find((c) => c[0] === 'setVolume');
    expect(master?.[1]).toBe('master');
    expect(master?.[2]).toBeCloseTo(0.8 * 0.35, 10);
  });

  it('setVolume clamps to AUDIO_VOLUME_RANGE', () => {
    const { store, audio } = setup();
    audio.setVolume(1.7);
    expect(store.get('settings').audio.volume).toBe(AUDIO_VOLUME_RANGE.max);
    audio.setVolume(-0.3);
    expect(store.get('settings').audio.volume).toBe(AUDIO_VOLUME_RANGE.min);
  });

  it('setVolume ignores non-finite input', () => {
    const { store, output, audio } = setup();
    const listener = vi.fn();
    audio.onChange(listener);
    output.calls.length = 0;
    const before = store.get('settings');
    audio.setVolume(Number.NaN);
    audio.setVolume(Number.POSITIVE_INFINITY);
    expect(store.get('settings')).toBe(before);
    expect(output.calls).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setSfxOn(false) persists and disables sfx on the output', () => {
    const { store, output, audio } = setup();
    output.calls.length = 0;
    audio.setSfxOn(false);
    expect(store.get('settings').audio.sfxOn).toBe(false);
    expect(output.calls).toContainEqual(['setSfxEnabled', false]);
  });

  it('leaves the other settings fields alone', () => {
    const { store, audio } = setup();
    const before = store.get('settings');
    audio.setMusicOn(true);
    const { audio: _audio, ...rest } = store.get('settings');
    void _audio;
    const { audio: _before, ...restBefore } = before;
    void _before;
    expect(rest).toEqual(restBefore);
  });

  it('onChange fires once per setter and stops after unsubscribe or dispose', () => {
    const { audio } = setup();
    const listener = vi.fn();
    const off = audio.onChange(listener);
    audio.setVolume(0.5);
    audio.setMusicOn(true);
    audio.setSfxOn(false);
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    audio.setVolume(0.6);
    expect(listener).toHaveBeenCalledTimes(3);
    const other = vi.fn();
    audio.onChange(other);
    audio.dispose();
    audio.setVolume(0.7);
    expect(other).not.toHaveBeenCalled();
  });

  it('works without an output', () => {
    const store = createSaveStore({ storage: createFakeStorage(), warn: vi.fn() });
    const audio = createAudioSettings({ store });
    audio.setVolume(0.2);
    expect(audio.settings().volume).toBe(0.2);
  });

  it('is exported from the app barrel', () => {
    expect(app.createAudioSettings).toBe(createAudioSettings);
    expect(app.AUDIO_VOLUME_RANGE).toBe(AUDIO_VOLUME_RANGE);
    expect(app.MASTER_HEADROOM).toBe(MASTER_HEADROOM);
  });
});
