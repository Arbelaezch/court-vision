// Audio layer: event-driven sound effects and music.
export { soundForEvent } from './eventSounds';
export type { SoundId } from './eventSounds';
export { createAudioEngine, createBrowserAudioContext, DEFAULT_VOLUMES } from './engine';
export type { AudioBus, AudioEngine, CreateAudioEngineOptions } from './engine';
export { createSoundDirector, FOOTSTEP_INTERVAL_TICKS } from './soundDirector';
export type { SoundCue, SoundStep } from './soundDirector';
export { bindUiClicks } from './uiClicks';
export { mountAudio } from './mountAudio';
export type { MountAudioOptions, MountedAudio } from './mountAudio';
export { MUSIC_LOOP_S } from './music';
export type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
} from './types';
