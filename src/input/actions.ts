// Abstract input actions. Held actions are polled state; press actions are one-shot events.
export const HELD_ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'sprint',
  'pivot',
] as const;

export const PRESS_ACTIONS = [
  'chestPass',
  'bouncePass',
  'lob',
  'shoot',
  'floater',
  'callForScreen',
  'pause',
  'passTarget1',
  'passTarget2',
  'passTarget3',
  'passTarget4',
] as const;

export type HeldAction = (typeof HELD_ACTIONS)[number];
export type PressAction = (typeof PRESS_ACTIONS)[number];
export type InputAction = HeldAction | PressAction;

export function isHeldAction(a: string): a is HeldAction {
  return (HELD_ACTIONS as readonly string[]).includes(a);
}

export function isPressAction(a: string): a is PressAction {
  return (PRESS_ACTIONS as readonly string[]).includes(a);
}

/** Slot number (1-4) for a pass-target action, or null for any other action. */
export function passTargetSlot(a: PressAction): 1 | 2 | 3 | 4 | null {
  switch (a) {
    case 'passTarget1':
      return 1;
    case 'passTarget2':
      return 2;
    case 'passTarget3':
      return 3;
    case 'passTarget4':
      return 4;
    default:
      return null;
  }
}
