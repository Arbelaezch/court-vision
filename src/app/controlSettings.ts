// App layer: control settings controller. Sole writer of the bindings section and the three control
// fields of settings; validates every candidate before it reaches the store and applies it to the mapper.
import {
  isGamepadAxisInput,
  isGamepadInput,
  isPressAction,
  validateBindings,
  type Binding,
  type Gesture,
  type InputAction,
  type InputCode,
  type InputMapper,
} from '../input';
import { PASS_TARGETING_MODES, type PassTargetingMode } from '../sim';
import {
  defaultSaveDocument,
  type BindingsSection,
  type SaveStore,
  type SettingsSection,
} from './storage';

export const CONTROL_ACTIONS: readonly { action: InputAction; label: string }[] = [
  { action: 'moveUp', label: 'Move up' },
  { action: 'moveDown', label: 'Move down' },
  { action: 'moveLeft', label: 'Move left' },
  { action: 'moveRight', label: 'Move right' },
  { action: 'sprint', label: 'Sprint' },
  { action: 'pivot', label: 'Pivot / protect' },
  { action: 'chestPass', label: 'Chest pass' },
  { action: 'bouncePass', label: 'Bounce pass' },
  { action: 'lob', label: 'Lob' },
  { action: 'shoot', label: 'Shoot' },
  { action: 'floater', label: 'Floater' },
  { action: 'callForScreen', label: 'Call for screen' },
  { action: 'passTarget1', label: 'Pass target 1 (SG)' },
  { action: 'passTarget2', label: 'Pass target 2 (SF)' },
  { action: 'passTarget3', label: 'Pass target 3 (PF)' },
  { action: 'passTarget4', label: 'Pass target 4 (C)' },
  { action: 'pause', label: 'Pause' },
];

export const DOUBLE_CLICK_WINDOW_RANGE = { min: 100, max: 600, step: 10 } as const;
export const AIM_SENSITIVITY_RANGE = { min: 0.25, max: 4, step: 0.25 } as const;

export const PASS_TARGETING_LABELS: Record<PassTargetingMode, string> = {
  numbered: 'Numbered',
  aim: 'Aim',
  both: 'Both',
};

export function actionLabel(action: InputAction): string {
  return CONTROL_ACTIONS.find((c) => c.action === action)?.label ?? action;
}

const GAMEPAD_BUTTON_NAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'D-pad up',
  'D-pad down',
  'D-pad left',
  'D-pad right',
  'Home',
];

const ARROWS: Record<string, string> = {
  ArrowUp: 'Up arrow',
  ArrowDown: 'Down arrow',
  ArrowLeft: 'Left arrow',
  ArrowRight: 'Right arrow',
};

const MOUSE_NAMES: Record<string, string> = {
  Mouse0: 'Left click',
  Mouse1: 'Middle click',
  Mouse2: 'Right click',
};

const AXIS_NAMES: Record<string, string> = {
  '0-': 'Left stick left',
  '0+': 'Left stick right',
  '1-': 'Left stick up',
  '1+': 'Left stick down',
  '2-': 'Right stick left',
  '2+': 'Right stick right',
  '3-': 'Right stick up',
  '3+': 'Right stick down',
};

function baseInputLabel(code: InputCode): string {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!;
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1]!;
  const arrow = ARROWS[code];
  if (arrow) return arrow;
  m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (m) return `${m[2]} ${m[1]}`;
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  const mouse = MOUSE_NAMES[code];
  if (mouse) return mouse;
  m = /^GamepadButton(\d+)$/.exec(code);
  if (m) return GAMEPAD_BUTTON_NAMES[Number(m[1])] ?? `Button ${m[1]}`;
  m = /^GamepadAxis(\d+)([+-])$/.exec(code);
  if (m) return AXIS_NAMES[`${m[1]}${m[2]}`] ?? `Axis ${m[1]}${m[2]}`;
  return code;
}

export function inputLabel(code: InputCode, gesture: Gesture = 'single'): string {
  const base = baseInputLabel(code);
  return gesture === 'double' ? `Double ${base}` : base;
}

export function controlDevice(code: InputCode): 'keyboard' | 'gamepad' {
  return isGamepadInput(code) ? 'gamepad' : 'keyboard';
}

export type RebindPlan =
  | { kind: 'ok'; bindings: Binding[] }
  | { kind: 'conflict'; conflictIndex: number; otherAction: InputAction; bindings: Binding[] }
  | { kind: 'unchanged'; message: string }
  | { kind: 'wrongDevice' }
  | { kind: 'invalid'; message: string };

export function planRebind(
  bindings: readonly Binding[],
  index: number,
  input: InputCode,
): RebindPlan {
  const slot = bindings[index];
  if (slot === undefined) return { kind: 'invalid', message: 'That binding no longer exists.' };
  const g: Gesture = slot.gesture ?? 'single';
  if (controlDevice(input) !== controlDevice(slot.input)) return { kind: 'wrongDevice' };
  if (isGamepadAxisInput(input) && isPressAction(slot.action)) {
    return { kind: 'invalid', message: 'Sticks can only be bound to movement, sprint or pivot.' };
  }
  if (input === slot.input) {
    return { kind: 'unchanged', message: `${inputLabel(input, g)} is already set.` };
  }
  const j = bindings.findIndex(
    (b, i) => i !== index && b.input === input && (b.gesture ?? 'single') === g,
  );
  const candidate: Binding[] = bindings.map((b) => ({ ...b }));
  candidate[index] = { ...candidate[index]!, input };
  let plan: RebindPlan;
  if (j >= 0) {
    const other = bindings[j]!;
    if (other.action === slot.action) {
      return {
        kind: 'unchanged',
        message: `${inputLabel(input, g)} is already bound to ${actionLabel(slot.action)}.`,
      };
    }
    candidate[j] = { ...candidate[j]!, input: slot.input };
    plan = { kind: 'conflict', conflictIndex: j, otherAction: other.action, bindings: candidate };
  } else {
    plan = { kind: 'ok', bindings: candidate };
  }
  try {
    validateBindings(candidate);
  } catch {
    return {
      kind: 'invalid',
      message: `${inputLabel(input, g)} can't be used for ${actionLabel(slot.action)} here.`,
    };
  }
  return plan;
}

export type CaptureState =
  | { kind: 'idle' }
  | { kind: 'listening'; index: number }
  | {
      kind: 'conflict';
      index: number;
      conflictIndex: number;
      input: InputCode;
      otherAction: InputAction;
    };

export interface ControlSettings {
  bindings(): BindingsSection;
  settings(): SettingsSection;
  capture(): CaptureState;
  message(): string | null;
  beginRebind(index: number): void;
  confirmSwap(): void;
  cancel(): void;
  setPassTargeting(mode: PassTargetingMode): void;
  setDoubleClickWindowMs(ms: number): void;
  setAimSensitivity(value: number): void;
  resetToDefaults(): void;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

/** Keys that menu navigation depends on; binding them would break keyboard use. */
const RESERVED_KEYS: readonly string[] = ['Tab', 'Enter', 'NumpadEnter'];

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function createControlSettings(opts: {
  store: SaveStore;
  input: Pick<InputMapper, 'configure' | 'startCapture'>;
}): ControlSettings {
  const { store, input } = opts;
  let capture: CaptureState = { kind: 'idle' };
  let message: string | null = null;
  let stopCapture: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const l of [...listeners]) l();
  };
  const apply = (): void => {
    input.configure({
      bindings: store.get('bindings'),
      doubleClickWindowMs: store.get('settings').doubleClickWindowMs,
    });
  };
  const stop = (): void => {
    stopCapture?.();
    stopCapture = null;
  };
  const finish = (msg: string | null): void => {
    stop();
    capture = { kind: 'idle' };
    message = msg;
    notify();
  };

  const commit = (next: Binding[]): boolean => {
    try {
      validateBindings(next);
    } catch {
      finish('Those bindings are not valid.');
      return false;
    }
    store.set('bindings', next);
    apply();
    return true;
  };

  /** Applies a captured input to a slot; `swapping` means the user confirmed a conflict. */
  const handlePlan = (index: number, code: InputCode, swapping: boolean): void => {
    const current = store.get('bindings');
    const plan = planRebind(current, index, code);
    const slot = current[index];
    const g: Gesture = slot?.gesture ?? 'single';
    switch (plan.kind) {
      case 'wrongDevice':
        if (swapping) finish(null); // otherwise keep listening
        return;
      case 'invalid':
      case 'unchanged':
        finish(plan.message);
        return;
      case 'conflict': {
        if (!swapping) {
          stop();
          capture = {
            kind: 'conflict',
            index,
            conflictIndex: plan.conflictIndex,
            input: code,
            otherAction: plan.otherAction,
          };
          message = `${inputLabel(code, g)} is already used by ${actionLabel(plan.otherAction)}. Swap them?`;
          notify();
          return;
        }
        const oldLabel = inputLabel(slot!.input, g);
        if (!commit(plan.bindings)) return;
        finish(
          `Swapped: ${actionLabel(slot!.action)} is now ${inputLabel(code, g)}, ${actionLabel(plan.otherAction)} is now ${oldLabel}.`,
        );
        return;
      }
      case 'ok':
        if (!commit(plan.bindings)) return;
        finish(`${actionLabel(slot!.action)} set to ${inputLabel(code, g)}.`);
        return;
    }
  };

  const onCaptured = (index: number) => (code: InputCode) => {
    if (code === 'Escape') {
      finish('Cancelled.');
      return;
    }
    if (RESERVED_KEYS.includes(code)) {
      finish(`${code} is reserved for menu navigation.`);
      return;
    }
    handlePlan(index, code, false);
  };

  const writeSettings = (patch: Partial<SettingsSection>): void => {
    store.set('settings', { ...store.get('settings'), ...patch });
    apply();
    notify();
  };

  apply();

  return {
    bindings: () => store.get('bindings'),
    settings: () => store.get('settings'),
    capture: () => capture,
    message: () => message,
    beginRebind(index) {
      stop();
      const slot = store.get('bindings')[index];
      if (slot === undefined) {
        finish('That binding no longer exists.');
        return;
      }
      capture = { kind: 'listening', index };
      message =
        controlDevice(slot.input) === 'gamepad'
          ? `Press a gamepad button for ${actionLabel(slot.action)} (Esc to cancel).`
          : `Press a key or mouse button for ${actionLabel(slot.action)} (Esc to cancel).`;
      stopCapture = input.startCapture(onCaptured(index));
      notify();
    },
    confirmSwap() {
      if (capture.kind !== 'conflict') return;
      handlePlan(capture.index, capture.input, true);
    },
    cancel() {
      finish(null);
    },
    setPassTargeting(mode) {
      if (!PASS_TARGETING_MODES.includes(mode)) return;
      writeSettings({ passTargeting: mode });
    },
    setDoubleClickWindowMs(ms) {
      if (!Number.isFinite(ms)) return;
      writeSettings({
        doubleClickWindowMs: clamp(
          Math.round(ms),
          DOUBLE_CLICK_WINDOW_RANGE.min,
          DOUBLE_CLICK_WINDOW_RANGE.max,
        ),
      });
    },
    setAimSensitivity(value) {
      if (!Number.isFinite(value)) return;
      writeSettings({
        aimSensitivity: clamp(value, AIM_SENSITIVITY_RANGE.min, AIM_SENSITIVITY_RANGE.max),
      });
    },
    resetToDefaults() {
      stop();
      capture = { kind: 'idle' };
      store.reset('bindings');
      const d = defaultSaveDocument().settings;
      store.set('settings', {
        ...store.get('settings'),
        passTargeting: d.passTargeting,
        doubleClickWindowMs: d.doubleClickWindowMs,
        aimSensitivity: d.aimSensitivity,
      });
      apply();
      message = 'Controls reset to defaults.';
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
