// Default bindings as plain data. Swap `action` fields to rebind; no code changes needed.
import { isHeldAction, isPressAction, type InputAction } from './actions';

/** KeyboardEvent.code (e.g. 'KeyW'), or 'Mouse0' | 'Mouse1' | 'Mouse2'. */
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
];

export function mouseButtonCode(button: number): InputCode {
  return `Mouse${button}`;
}

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
    if (!isHeldAction(b.action) && !isPressAction(b.action)) {
      fail(`has unknown action "${String(b.action)}"`);
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
