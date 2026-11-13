// DOM-free mapper: turns press/release of input codes into held state and press actions.
import { isPressAction, type HeldAction, type PressAction } from './actions';
import {
  DEFAULT_BINDINGS,
  DEFAULT_DOUBLE_CLICK_WINDOW_MS,
  validateBindings,
  type Binding,
  type InputCode,
} from './bindings';

/** Runs fn after delayMs; returns a cancel function. */
export type Schedule = (fn: () => void, delayMs: number) => () => void;

export interface InputMapperOptions {
  bindings?: readonly Binding[];
  doubleClickWindowMs?: number;
  schedule?: Schedule;
}

export interface InputMapper {
  press(input: InputCode): void;
  release(input: InputCode): void;
  /** Sets an analog magnitude (clamped to [0, 1]) for an input; 0 clears it. Never emits actions. */
  setAnalog(input: InputCode, value: number): void;
  releaseAll(): void;
  isHeld(action: HeldAction): boolean;
  moveAxes(): { x: number; y: number };
  /** True while a single press waits out the double-click window. */
  hasPendingPress(): boolean;
  onAction(listener: (action: PressAction) => void): () => void;
  dispose(): void;
}

const defaultSchedule: Schedule = (fn, delayMs) => {
  const handle = globalThis.setTimeout(fn, delayMs);
  return () => globalThis.clearTimeout(handle);
};

export function createInputMapper(options: InputMapperOptions = {}): InputMapper {
  const bindings = options.bindings ?? DEFAULT_BINDINGS;
  const windowMs = options.doubleClickWindowMs ?? DEFAULT_DOUBLE_CLICK_WINDOW_MS;
  const schedule = options.schedule ?? defaultSchedule;

  validateBindings(bindings);
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs < 0) {
    throw new Error('Court Vision: doubleClickWindowMs must be a finite number >= 0');
  }

  const pressed = new Set<InputCode>();
  const analog = new Map<InputCode, number>();
  const pending = new Map<InputCode, () => void>();
  const listeners = new Set<(action: PressAction) => void>();
  let disposed = false;

  const emit = (action: PressAction): void => {
    for (const listener of [...listeners]) listener(action);
  };

  const pressActions = (input: InputCode, gesture: 'single' | 'double'): PressAction[] => {
    const out: PressAction[] = [];
    for (const b of bindings) {
      if (b.input === input && (b.gesture ?? 'single') === gesture && isPressAction(b.action)) {
        out.push(b.action);
      }
    }
    return out;
  };

  const hasDouble = (input: InputCode): boolean =>
    bindings.some((b) => b.input === input && b.gesture === 'double');

  const cancelAllPending = (): void => {
    for (const cancel of pending.values()) cancel();
    pending.clear();
  };

  const digitalHeld = (action: HeldAction): boolean =>
    bindings.some(
      (b) => b.action === action && (b.gesture ?? 'single') === 'single' && pressed.has(b.input),
    );

  const analogLevel = (action: HeldAction): number => {
    let level = 0;
    for (const b of bindings) {
      if (b.action === action && (b.gesture ?? 'single') === 'single') {
        level = Math.max(level, analog.get(b.input) ?? 0);
      }
    }
    return level;
  };

  const isHeld = (action: HeldAction): boolean => digitalHeld(action) || analogLevel(action) > 0;

  const dir = (action: HeldAction): number =>
    Math.max(digitalHeld(action) ? 1 : 0, analogLevel(action));

  return {
    press(input) {
      if (disposed || pressed.has(input)) return;
      pressed.add(input);
      if (!hasDouble(input)) {
        for (const a of pressActions(input, 'single')) emit(a);
        return;
      }
      const cancel = pending.get(input);
      if (cancel) {
        cancel();
        pending.delete(input);
        for (const a of pressActions(input, 'double')) emit(a);
        return;
      }
      const cancelTimer = schedule(() => {
        pending.delete(input);
        for (const a of pressActions(input, 'single')) emit(a);
      }, windowMs);
      pending.set(input, cancelTimer);
    },
    release(input) {
      pressed.delete(input);
    },
    setAnalog(input, value) {
      if (disposed) return;
      const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      if (v === 0) analog.delete(input);
      else analog.set(input, v);
    },
    releaseAll() {
      pressed.clear();
      analog.clear();
      cancelAllPending();
    },
    isHeld,
    moveAxes() {
      const x = dir('moveRight') - dir('moveLeft');
      const y = dir('moveUp') - dir('moveDown');
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    hasPendingPress: () => pending.size > 0,
    onAction(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      cancelAllPending();
      pressed.clear();
      analog.clear();
      listeners.clear();
    },
  };
}
