// Audio layer: mounts the audio engine and unlocks it on the first user gesture.

import { createAudioEngine, createBrowserAudioContext } from './engine';
import type { AudioBus, AudioEngine } from './engine';
import type { AudioContextLike } from './types';

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export interface MountAudioOptions {
  target?: EventTarget;
  createContext?: () => AudioContextLike;
  volumes?: Partial<Record<AudioBus, number>>;
}

export interface MountedAudio {
  engine: AudioEngine;
  unmount: () => void;
}

export function mountAudio(options: MountAudioOptions = {}): MountedAudio {
  const target = options.target ?? window;
  const engine = createAudioEngine({
    createContext: options.createContext ?? createBrowserAudioContext,
    volumes: options.volumes,
  });

  const removeListeners = (): void => {
    for (const name of GESTURE_EVENTS) {
      target.removeEventListener(name, onGesture, { capture: true });
    }
  };

  function onGesture(): void {
    engine.unlock();
    if (engine.isRunning()) removeListeners();
  }

  for (const name of GESTURE_EVENTS) {
    target.addEventListener(name, onGesture, { capture: true });
  }

  return {
    engine,
    unmount: () => {
      removeListeners();
      engine.dispose();
    },
  };
}
