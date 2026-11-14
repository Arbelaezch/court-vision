/** Minimal shapes the menu-event handler needs, so it is testable without the DOM. */
export interface MenuFlowLike<E> {
  send(event: E): void;
  state(): { screen: string };
}

export interface ReleasableInput {
  releaseAll(): void;
}

export interface ClearableHuman {
  clear(): void;
}

/**
 * Sends a menu event to the flow. If it started a run, the menu click is still a pending Mouse0
 * press in the input mapper; drop it (and any held keys) so it is not replayed as a chest pass.
 */
export function handleMenuEvent<E>(
  flow: MenuFlowLike<E>,
  input: ReleasableInput,
  human: ClearableHuman,
  event: E,
): void {
  flow.send(event);
  if (flow.state().screen === 'inRun') {
    input.releaseAll();
    human.clear();
  }
}
