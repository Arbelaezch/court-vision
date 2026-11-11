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
export { mountInput, type MountInputOptions, type MountedInput } from './mountInput';
