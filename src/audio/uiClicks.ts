// Audio layer: a click blip for every button press under a DOM root.

interface ClosestLike {
  closest(selector: string): unknown;
}

export function isButtonClick(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const closest = (target as Partial<ClosestLike>).closest;
  if (typeof closest !== 'function') return false;
  return closest.call(target, 'button') !== null;
}

export function bindUiClicks(target: EventTarget, play: () => void): () => void {
  const listener = (event: Event): void => {
    if (isButtonClick(event.target)) play();
  };
  target.addEventListener('click', listener);
  return () => target.removeEventListener('click', listener);
}
