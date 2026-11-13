// Default bindings as plain data. Swap `action` fields to rebind; no code changes needed.
import { isHeldAction, isPressAction, type InputAction } from './actions';

/**
 * KeyboardEvent.code (e.g. 'KeyW'), 'Mouse0' | 'Mouse1' | 'Mouse2', or a gamepad input:
 * 'GamepadButton<N>' or 'GamepadAxis<N>+' | 'GamepadAxis<N>-' (half-range of an axis).
 * Gamepad indices follow the W3C "standard" mapping.
 */
export type InputCode = string;
export type Gesture = 'single' | 'double';

export interface Binding {
  readonly input: InputCode;
  readonly action: InputAction;
  /** Omitted means 'single'. */
  readonly gesture?: Gesture;
}

export const DEFAULT_DOUBLE_CLICK_WINDOW_MS = 220;

export const DEFAULT_BINDINGS: readonly Binding[] = [
  { input: 'KeyW', action: 'moveUp' },
  { input: 'ArrowUp', action: 'moveUp' },
  { input: 'KeyS', action: 'moveDown' },
  { input: 'ArrowDown', action: 'moveDown' },
  { input: 'KeyA', action: 'moveLeft' },
  { input: 'ArrowLeft', action: 'moveLeft' },
  { input: 'KeyD', action: 'moveRight' },
  { input: 'ArrowRight', action: 'moveRight' },
  { input: 'ShiftLeft', action: 'sprint' },
  { input: 'ShiftRight', action: 'sprint' },
  { input: 'Digit1', action: 'passTarget1' },
  { input: 'Digit2', action: 'passTarget2' },
  { input: 'Digit3', action: 'passTarget3' },
  { input: 'Digit4', action: 'passTarget4' },
  { input: 'Mouse0', action: 'chestPass' },
  { input: 'Mouse0', action: 'lob', gesture: 'double' },
  { input: 'KeyR', action: 'lob' },
  { input: 'Mouse2', action: 'bouncePass' },
  { input: 'Space', action: 'shoot' },
  { input: 'KeyE', action: 'floater' },
  { input: 'KeyQ', action: 'callForScreen' },
  { input: 'KeyC', action: 'pivot' },
  { input: 'Escape', action: 'pause' },
  { input: 'GamepadAxis0-', action: 'moveLeft' },
  { input: 'GamepadAxis0+', action: 'moveRight' },
  { input: 'GamepadAxis1-', action: 'moveUp' },
  { input: 'GamepadAxis1+', action: 'moveDown' },
  { input: 'GamepadButton7', action: 'sprint' }, // RT
  { input: 'GamepadButton6', action: 'pivot' }, // LT
  { input: 'GamepadButton0', action: 'chestPass' }, // A / Cross
  { input: 'GamepadButton1', action: 'bouncePass' }, // B / Circle
  { input: 'GamepadButton3', action: 'lob' }, // Y / Triangle
  { input: 'GamepadButton2', action: 'shoot' }, // X / Square
  { input: 'GamepadButton5', action: 'floater' }, // RB
  { input: 'GamepadButton4', action: 'callForScreen' }, // LB
  { input: 'GamepadButton9', action: 'pause' }, // Start
  { input: 'GamepadButton12', action: 'passTarget1' }, // D-pad up
  { input: 'GamepadButton15', action: 'passTarget2' }, // D-pad right
  { input: 'GamepadButton13', action: 'passTarget3' }, // D-pad down
  { input: 'GamepadButton14', action: 'passTarget4' }, // D-pad left
];

export function mouseButtonCode(button: number): InputCode {
  return `Mouse${button}`;
}

export function gamepadButtonCode(index: number): InputCode {
  return `GamepadButton${index}`;
}

export function gamepadAxisCode(index: number, sign: '+' | '-'): InputCode {
  return `GamepadAxis${index}${sign}`;
}

const GAMEPAD_BUTTON_RE = /^GamepadButton(0|[1-9]\d?)$/;
const GAMEPAD_AXIS_RE = /^GamepadAxis(0|[1-9]\d?)[+-]$/;

export function validateBindings(bindings: readonly Binding[]): void {
  const seen = new Set<string>();
  const heldInputs = new Set<InputCode>();
  const doubleInputs = new Set<InputCode>();
  bindings.forEach((b, i) => {
    const fail = (problem: string): never => {
      throw new Error(`Court Vision: bindings[${i}] ${problem}`);
    };
    if (typeof b !== 'object' || b === null) fail('is not an object');
    if (typeof b.input !== 'string' || b.input === '') fail('has an empty input');
    if (
      b.input.startsWith('Gamepad') &&
      !GAMEPAD_BUTTON_RE.test(b.input) &&
      !GAMEPAD_AXIS_RE.test(b.input)
    ) {
      fail(`has malformed gamepad input "${b.input}"`);
    }
    if (!isHeldAction(b.action) && !isPressAction(b.action)) {
      fail(`has unknown action "${String(b.action)}"`);
    }
    if (GAMEPAD_AXIS_RE.test(b.input) && isPressAction(b.action)) {
      fail(`binds gamepad axis "${b.input}" to press action "${b.action}"`);
    }
    if (b.gesture !== undefined && b.gesture !== 'single' && b.gesture !== 'double') {
      fail(`has unknown gesture "${String(b.gesture)}"`);
    }
    const gesture: Gesture = b.gesture ?? 'single';
    const key = `${b.input}\u0000${gesture}`;
    if (seen.has(key)) fail(`duplicates input "${b.input}" with gesture "${gesture}"`);
    seen.add(key);
    if (gesture === 'double' && isHeldAction(b.action)) {
      fail(`uses a double gesture with held action "${b.action}"`);
    }
    if (isHeldAction(b.action)) heldInputs.add(b.input);
    if (gesture === 'double') doubleInputs.add(b.input);
    if (heldInputs.has(b.input) && doubleInputs.has(b.input)) {
      fail(`input "${b.input}" has both a held binding and a double binding`);
    }
  });
}
