export interface VisibilityPauseOptions {
  target: EventTarget; // document in the browser
  isHidden: () => boolean; // () => document.hidden
  onPause: () => void;
  onResume: () => void;
}

export function bindVisibilityPause(options: VisibilityPauseOptions): () => void {
  const { target, isHidden, onPause, onResume } = options;
  let running = false;

  if (!isHidden()) {
    running = true;
    onResume();
  }

  const handler = (): void => {
    if (isHidden()) {
      if (running) {
        running = false;
        onPause();
      }
    } else if (!running) {
      running = true;
      onResume();
    }
  };

  target.addEventListener('visibilitychange', handler);
  return () => target.removeEventListener('visibilitychange', handler);
}
