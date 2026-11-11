// Audio layer: event-driven sound effects and music.
export { soundForEvent } from './eventSounds';
export type { SoundId } from './eventSounds';
export { createAudioEngine, createBrowserAudioContext, DEFAULT_VOLUMES } from './engine';
export type { AudioBus, AudioEngine, CreateAudioEngineOptions } from './engine';
export { mountAudio } from './mountAudio';
export type { MountAudioOptions, MountedAudio } from './mountAudio';
export type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
} from './types';
