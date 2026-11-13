// Input layer: thin DOM adapter that feeds Gamepad API state into the DOM-free gamepad poller.

import { createGamepadPoller } from './gamepad';
import type { GamepadLike, GamepadSource } from './gamepad';
import type { InputMapper } from './mapper';

/** Schedules a callback for the next frame and returns a function that cancels it. */
export type FrameScheduler = (callback: () => void) => () => void;

export interface MountGamepadOptions {
  target?: EventTarget;
  getGamepads?: GamepadSource;
  deadZone?: number;
  /** Frame loop driver. `null` disables the loop; omitted uses requestAnimationFrame when present. */
  requestFrame?: FrameScheduler | null;
}

export interface MountedGamepad {
  poll: () => void;
  unmount: () => void;
}

const defaultGetGamepads: GamepadSource = () => {
  const nav = (
    globalThis as { navigator?: { getGamepads?: () => Iterable<GamepadLike | null> } }
  ).navigator;
  if (typeof nav?.getGamepads === 'function') return Array.from(nav.getGamepads());
  return [];
};

function defaultRequestFrame(): FrameScheduler | null {
  if (typeof globalThis.requestAnimationFrame !== 'function') return null;
  return (cb) => {
    const handle = requestAnimationFrame(() => cb());
    return () => cancelAnimationFrame(handle);
  };
}

function readGamepadIndex(e: Event): number | null {
  if (!('gamepad' in e)) return null;
  const pad = e.gamepad;
  if (typeof pad !== 'object' || pad === null) return null;
  if (!('index' in pad) || typeof pad.index !== 'number') return null;
  return pad.index;
}

export function mountGamepad(
  input: InputMapper,
  options: MountGamepadOptions = {},
): MountedGamepad {
  const target = options.target ?? window;
  const getGamepads = options.getGamepads ?? defaultGetGamepads;
  const requestFrame =
    options.requestFrame === undefined ? defaultRequestFrame() : options.requestFrame;
  const poller = createGamepadPoller(input, { getGamepads, deadZone: options.deadZone });
  let mounted = true;
  let cancel: (() => void) | null = null;

  function onConnected(): void {
    poller.poll();
  }

  function onDisconnected(e: Event): void {
    if (!mounted) return;
    const excludeIndex = readGamepadIndex(e);
    if (excludeIndex === null) poller.poll();
    else poller.poll({ excludeIndex });
  }

  target.addEventListener('gamepadconnected', onConnected);
  target.addEventListener('gamepaddisconnected', onDisconnected);

  function tick(): void {
    if (!mounted) return;
    poller.poll();
    if (mounted && requestFrame) cancel = requestFrame(tick);
  }
  if (requestFrame) cancel = requestFrame(tick);

  return {
    poll: () => {
      if (mounted) poller.poll();
    },
    unmount: () => {
      if (!mounted) return;
      mounted = false;
      target.removeEventListener('gamepadconnected', onConnected);
      target.removeEventListener('gamepaddisconnected', onDisconnected);
      cancel?.();
      cancel = null;
      poller.releaseGamepadInputs();
    },
  };
}
