// Human input to SimActions: held state plus queued press actions become one sim step's actions. DOM-free.
import type { RunControllerState } from '../ai';
import { passTargetSlot, type PressAction } from '../input';
import {
  resolvePassTarget,
  type CourtPoint,
  type PassTargetKey,
  type PassTargetingSettings,
  type PassType,
  type SimAction,
} from '../sim';

export interface HeldInput {
  axes: { x: number; y: number };
  sprint: boolean;
  pivot: boolean;
}

export interface HumanInputSources {
  held(): HeldInput;
  aimAt(): CourtPoint | null;
  targeting(): PassTargetingSettings;
}

export interface HumanInput {
  press(action: PressAction): void;
  actionsFor(controller: RunControllerState): SimAction[];
  clear(): void;
}

type QueuedPress = { kind: 'pass'; passType: PassType } | { kind: 'shoot' } | { kind: 'floater' };

const PASS_PRESSES: Partial<Record<PressAction, PassType>> = {
  chestPass: 'chestPass',
  bouncePass: 'bouncePass',
  lob: 'lob',
};

export function createHumanInput(sources: HumanInputSources): HumanInput {
  let selectedKey: PassTargetKey | null = null;
  let queue: QueuedPress[] = [];
  let lastOptions: unknown = null;
  let lastRunIndex: number | null = null;

  function clear(): void {
    selectedKey = null;
    queue = [];
  }

  function press(action: PressAction): void {
    const slot = passTargetSlot(action);
    if (slot !== null) {
      selectedKey = slot;
      return;
    }
    const passType = PASS_PRESSES[action];
    if (passType !== undefined) {
      queue.push({ kind: 'pass', passType });
    } else if (action === 'shoot') {
      queue.push({ kind: 'shoot' });
    } else if (action === 'floater') {
      queue.push({ kind: 'floater' });
    }
    // pause and callForScreen are not sim actions (call for screen is inert in v1).
  }

  function actionsFor(controller: RunControllerState): SimAction[] {
    const seen = lastRunIndex !== null;
    if (seen && (controller.options !== lastOptions || controller.runIndex !== lastRunIndex)) {
      clear();
    }
    if (!seen || controller.options !== lastOptions || controller.runIndex !== lastRunIndex) {
      lastOptions = controller.options;
      lastRunIndex = controller.runIndex;
    }
    const held = sources.held();
    const actions: SimAction[] = [
      { type: 'move', x: held.axes.x, z: -held.axes.y },
      { type: 'sprint', held: held.sprint },
      { type: 'pivot', held: held.pivot },
    ];
    const pending = queue;
    queue = [];
    for (const item of pending) {
      if (item.kind === 'shoot') {
        actions.push({ type: 'shoot' });
      } else if (item.kind === 'floater') {
        actions.push({ type: 'floater' });
      } else {
        const targetId = resolvePassTarget(
          controller.game,
          { key: selectedKey, aimAt: sources.aimAt() },
          sources.targeting(),
        );
        if (targetId !== null) {
          actions.push({ type: 'pass', passType: item.passType, targetId });
          selectedKey = null;
        }
      }
    }
    return actions;
  }

  return { press, actionsFor, clear };
}
