// App layer: progress reset controller. Holds the request/confirm/cancel state around
// store.resetProgress(); settings and bindings are left alone (controls reset is separate).
import type { SaveStore } from './storage';

export interface ProgressReset {
  pending(): boolean;
  message(): string | null;
  request(): void;
  confirm(): void;
  cancel(): void;
  onChange(l: () => void): () => void;
  dispose(): void;
}

export interface ProgressResetOptions {
  store: SaveStore;
}

export function createProgressReset({ store }: ProgressResetOptions): ProgressReset {
  const listeners = new Set<() => void>();
  let pending = false;
  let message: string | null = null;

  const notify = (): void => {
    for (const l of [...listeners]) l();
  };

  return {
    pending: () => pending,
    message: () => message,
    request() {
      pending = true;
      message = null;
      notify();
    },
    confirm() {
      if (!pending) return;
      store.resetProgress();
      pending = false;
      message = 'Progress reset.';
      notify();
    },
    cancel() {
      if (!pending && message === null) return;
      pending = false;
      message = null;
      notify();
    },
    onChange(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    dispose() {
      listeners.clear();
    },
  };
}
