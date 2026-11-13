// Input layer: abstract actions (pass, sprint, shoot...) mapped from physical inputs. Fully rebindable.
export {
  HELD_ACTIONS,
  PRESS_ACTIONS,
  isHeldAction,
  isPressAction,
  passTargetSlot,
  type HeldAction,
  type PressAction,
  type InputAction,
} from './actions';
export {
  DEFAULT_BINDINGS,
  DEFAULT_DOUBLE_CLICK_WINDOW_MS,
  validateBindings,
  mouseButtonCode,
  gamepadButtonCode,
  gamepadAxisCode,
  type Binding,
  type Gesture,
  type InputCode,
} from './bindings';
export {
  createInputMapper,
  type InputMapper,
  type InputMapperOptions,
  type Schedule,
} from './mapper';
export {
  DEFAULT_GAMEPAD_DEAD_ZONE,
  GAMEPAD_BUTTON_THRESHOLD,
  applyRadialDeadZone,
  readGamepadState,
  createGamepadPoller,
  type GamepadLike,
  type GamepadButtonLike,
  type GamepadSource,
  type GamepadState,
  type GamepadPoller,
  type GamepadPollerOptions,
} from './gamepad';
export {
  mountGamepad,
  type MountGamepadOptions,
  type MountedGamepad,
  type FrameScheduler,
} from './mountGamepad';
export { mountInput, type MountInputOptions, type MountedInput } from './mountInput';
