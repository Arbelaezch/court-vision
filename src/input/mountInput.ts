// Input layer: mounts keyboard and mouse listeners that feed the DOM-free input mapper.

import { DEFAULT_BINDINGS, mouseButtonCode } from './bindings';
import { createInputMapper } from './mapper';
import type { InputMapper, InputMapperOptions } from './mapper';

const INPUT_EVENTS = ['keydown', 'keyup', 'mousedown', 'mouseup', 'blur', 'contextmenu'] as const;

export interface MountInputOptions extends InputMapperOptions {
  target?: EventTarget;
}

export interface MountedInput {
  input: InputMapper;
  unmount: () => void;
}

function readCode(e: Event): string | null {
  return 'code' in e && typeof e.code === 'string' ? e.code : null;
}

function readButton(e: Event): number | null {
  return 'button' in e && typeof e.button === 'number' ? e.button : null;
}

function readRepeat(e: Event): boolean {
  return 'repeat' in e && e.repeat === true;
}

function hasShortcutModifier(e: Event): boolean {
  return (
    ('ctrlKey' in e && e.ctrlKey === true) ||
    ('metaKey' in e && e.metaKey === true) ||
    ('altKey' in e && e.altKey === true)
  );
}

export function mountInput(options: MountInputOptions = {}): MountedInput {
  const target = options.target ?? window;
  const bindings = options.bindings ?? DEFAULT_BINDINGS;
  const input = createInputMapper(options);
  const boundInputs = new Set(bindings.map((b) => b.input));
  let mounted = true;

  function onEvent(e: Event): void {
    switch (e.type) {
      case 'keydown': {
        const code = readCode(e);
        // macOS drops keyups for other keys while Meta is down; don't leave them stuck.
        if (code === 'MetaLeft' || code === 'MetaRight') input.releaseAll();
        if (readRepeat(e)) return;
        if (code === null) return;
        if (hasShortcutModifier(e)) return;
        if (boundInputs.has(code)) e.preventDefault();
        input.press(code);
        return;
      }
      case 'keyup': {
        const code = readCode(e);
        if (code !== null) input.release(code);
        return;
      }
      case 'mousedown': {
        const button = readButton(e);
        if (button !== null) input.press(mouseButtonCode(button));
        return;
      }
      case 'mouseup': {
        const button = readButton(e);
        if (button !== null) input.release(mouseButtonCode(button));
        return;
      }
      case 'blur':
        input.releaseAll();
        return;
      case 'contextmenu':
        if (boundInputs.has(mouseButtonCode(2))) e.preventDefault();
        return;
    }
  }

  for (const name of INPUT_EVENTS) {
    target.addEventListener(name, onEvent);
  }

  return {
    input,
    unmount: () => {
      if (!mounted) return;
      mounted = false;
      for (const name of INPUT_EVENTS) {
        target.removeEventListener(name, onEvent);
      }
      input.dispose();
    },
  };
}
