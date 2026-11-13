// DOM-free gamepad core: dead zone, pad state reading, and an edge-detecting poller.
import { gamepadAxisCode, gamepadButtonCode, type InputCode } from './bindings';
import type { InputMapper } from './mapper';

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly index: number;
  readonly connected: boolean;
  readonly mapping?: string;
  readonly buttons: readonly GamepadButtonLike[];
  readonly axes: readonly number[];
}

export type GamepadSource = () => readonly (GamepadLike | null | undefined)[];

export const DEFAULT_GAMEPAD_DEAD_ZONE = 0.15;
export const GAMEPAD_BUTTON_THRESHOLD = 0.5;

const finiteOrZero = (n: number): number => (Number.isFinite(n) ? n : 0);

/** Radial dead zone: magnitudes inside dz give 0; the rest is rescaled to 0..1. */
export function applyRadialDeadZone(
  x: number,
  y: number,
  deadZone: number,
): { x: number; y: number } {
  const fx = finiteOrZero(x);
  const fy = finiteOrZero(y);
  const m = Math.hypot(fx, fy);
  if (m === 0 || m <= deadZone) return { x: 0, y: 0 };
  const s = Math.min(1, (m - deadZone) / (1 - deadZone));
  return { x: (fx / m) * s, y: (fy / m) * s };
}

function axisDeadZone(v: number, deadZone: number): number {
  const f = finiteOrZero(v);
  const a = Math.abs(f);
  if (a <= deadZone) return 0;
  return Math.sign(f) * Math.min(1, (a - deadZone) / (1 - deadZone));
}

export interface GamepadState {
  buttons: Set<InputCode>;
  analog: Map<InputCode, number>;
}

export function readGamepadState(
  pads: readonly (GamepadLike | null | undefined)[],
  deadZone: number,
  excludeIndex?: number,
): GamepadState {
  const buttons = new Set<InputCode>();
  const analog = new Map<InputCode, number>();

  const setMax = (code: InputCode, v: number): void => {
    if (v > (analog.get(code) ?? 0)) analog.set(code, v);
  };

  for (const pad of pads) {
    if (!pad || pad.connected === false || pad.index === excludeIndex) continue;
    const padButtons = Array.isArray(pad.buttons) ? pad.buttons : [];
    const axes: readonly number[] = Array.isArray(pad.axes) ? pad.axes : [];

    padButtons.forEach((b, i) => {
      if (b && (b.pressed === true || b.value >= GAMEPAD_BUTTON_THRESHOLD)) {
        buttons.add(gamepadButtonCode(i));
      }
    });

    const values: number[] = axes.map(() => 0);
    const paired = new Set<number>();
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ] as const) {
      const ax = axes[a];
      const ay = axes[b];
      if (ax !== undefined && ay !== undefined) {
        const r = applyRadialDeadZone(ax, ay, deadZone);
        values[a] = r.x;
        values[b] = r.y;
        paired.add(a).add(b);
      }
    }
    axes.forEach((v, i) => {
      if (!paired.has(i)) values[i] = axisDeadZone(v, deadZone);
    });

    values.forEach((v, i) => {
      if (v > 0) setMax(gamepadAxisCode(i, '+'), v);
      else if (v < 0) setMax(gamepadAxisCode(i, '-'), -v);
    });
  }

  return { buttons, analog };
}

export interface GamepadPollerOptions {
  getGamepads: GamepadSource;
  deadZone?: number;
}

export interface GamepadPoller {
  poll(options?: { excludeIndex?: number }): void;
  releaseGamepadInputs(): void;
}

export function createGamepadPoller(
  input: InputMapper,
  options: GamepadPollerOptions,
): GamepadPoller {
  const deadZone = options.deadZone ?? DEFAULT_GAMEPAD_DEAD_ZONE;
  if (typeof deadZone !== 'number' || !Number.isFinite(deadZone) || deadZone < 0 || deadZone >= 1) {
    throw new Error('Court Vision: gamepad deadZone must be a finite number in [0, 1)');
  }

  let prevButtons = new Set<InputCode>();
  let prevAnalog = new Map<InputCode, number>();
  let generation = 0;

  return {
    poll(pollOptions) {
      let pads: readonly (GamepadLike | null | undefined)[];
      try {
        const result = options.getGamepads();
        pads = Array.isArray(result) ? result : [];
      } catch {
        pads = [];
      }
      const next = readGamepadState(pads, deadZone, pollOptions?.excludeIndex);

      // Track state incrementally so a re-entrant releaseGamepadInputs() (from a listener)
      // sees every input pressed so far, and stop applying once it has run.
      const gen = generation;
      for (const code of [...prevButtons]) {
        if (next.buttons.has(code)) continue;
        prevButtons.delete(code);
        input.release(code);
        if (gen !== generation) return;
      }
      for (const code of next.buttons) {
        if (prevButtons.has(code)) continue;
        prevButtons.add(code);
        input.press(code);
        if (gen !== generation) return;
      }
      for (const code of [...prevAnalog.keys()]) {
        if (next.analog.has(code)) continue;
        prevAnalog.delete(code);
        input.setAnalog(code, 0);
        if (gen !== generation) return;
      }
      for (const [code, v] of next.analog) {
        prevAnalog.set(code, v);
        input.setAnalog(code, v);
        if (gen !== generation) return;
      }
    },
    releaseGamepadInputs() {
      generation++;
      const buttons = [...prevButtons];
      const analog = [...prevAnalog.keys()];
      prevButtons = new Set();
      prevAnalog = new Map();
      for (const code of buttons) input.release(code);
      for (const code of analog) input.setAnalog(code, 0);
    },
  };
}
