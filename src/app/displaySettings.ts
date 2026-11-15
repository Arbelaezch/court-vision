// App layer: display settings controller. Sole writer of settings.cues and settings.reduceMotion.
// Turning a cue off needs a confirmation (held here as pending); the reduce-motion value is pushed to a
// structural output so the app layer does not import src/ui or src/render.
import { DEFAULT_CUE_TOGGLES, type CueToggle } from '../content';
import type { SaveStore, SettingsSection } from './storage';

export interface MotionOutput {
  setReduceMotion(on: boolean): void;
}

export type CueSettingsValue = SettingsSection['cues'];

export const CUE_TOGGLE_LABELS: Readonly<Record<CueToggle, string>> = {
  floorArrows: 'Floor arrows',
  targetRings: 'Target rings',
  prompts: 'Prompts',
};

export interface DisplayConfirm {
  readonly kind: 'cueOff';
  readonly cue: CueToggle;
}

export interface DisplaySettings {
  cues(): CueSettingsValue;
  reduceMotion(): boolean;
  setCueToggle(cue: CueToggle, on: boolean): void;
  pending(): DisplayConfirm | null;
  confirm(): void;
  cancel(): void;
  setReduceMotion(on: boolean): void;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export interface DisplaySettingsOptions {
  store: SaveStore;
  output?: MotionOutput;
}

export function createDisplaySettings({ store, output }: DisplaySettingsOptions): DisplaySettings {
  const listeners = new Set<() => void>();
  let pending: DisplayConfirm | null = null;

  const notify = (): void => {
    for (const l of [...listeners]) l();
  };

  const apply = (): void => {
    output?.setReduceMotion(store.get('settings').reduceMotion);
  };

  const writeCue = (cue: CueToggle, on: boolean): void => {
    const settings = store.get('settings');
    store.set('settings', { ...settings, cues: { ...settings.cues, [cue]: on } });
  };

  apply();

  return {
    cues: () => store.get('settings').cues,
    reduceMotion: () => store.get('settings').reduceMotion,
    setCueToggle(cue, on) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_CUE_TOGGLES, cue)) return;
      if (on) {
        pending = null;
        writeCue(cue, true);
        notify();
        return;
      }
      if (!store.get('settings').cues[cue]) return;
      pending = { kind: 'cueOff', cue };
      notify();
    },
    pending: () => pending,
    confirm() {
      if (pending === null) return;
      const { cue } = pending;
      pending = null;
      writeCue(cue, false);
      notify();
    },
    cancel() {
      if (pending === null) return;
      pending = null;
      notify();
    },
    setReduceMotion(on) {
      const settings = store.get('settings');
      store.set('settings', { ...settings, reduceMotion: on });
      apply();
      notify();
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
