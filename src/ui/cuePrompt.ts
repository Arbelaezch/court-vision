import type { CuePrompt } from '../content';

export interface CuePromptOverlay {
  show(prompt: CuePrompt | null): void;
  dispose(): void;
}

// HTML "do this now" prompt: headline plus a short reason line (DESIGN_DOC cues).
export function createCuePromptOverlay(opts: {
  container: HTMLElement;
  doc: Document;
}): CuePromptOverlay {
  const { container, doc } = opts;
  const root = doc.createElement('div');
  root.className = 'cue-prompt';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.style.cssText =
    'position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); max-width: 80vw; padding: 10px 18px; text-align: center; color: #fff; background: rgba(0,0,0,0.75); border-radius: 8px; pointer-events: none';
  // The live region stays in the accessibility tree; "hidden" means empty with no box.
  const hideBox = (): void => {
    root.style.background = 'transparent';
    root.style.padding = '0';
  };
  const showBox = (): void => {
    root.style.background = 'rgba(0,0,0,0.75)';
    root.style.padding = '10px 18px';
  };
  hideBox();

  const headline = doc.createElement('div');
  headline.className = 'cue-prompt-headline';
  headline.style.cssText = 'font: bold 28px sans-serif';
  const reason = doc.createElement('div');
  reason.className = 'cue-prompt-reason';
  reason.style.cssText = 'font: 16px sans-serif; margin-top: 4px';
  root.appendChild(headline);
  root.appendChild(reason);
  container.appendChild(root);

  let shown = false;
  let lastHeadline: string | null = null;
  let lastReason: string | null = null;

  return {
    show(prompt) {
      if (prompt === null) {
        if (shown) {
          shown = false;
          headline.textContent = '';
          reason.textContent = '';
          hideBox();
          lastHeadline = null;
          lastReason = null;
        }
        return;
      }
      if (shown && prompt.headline === lastHeadline && prompt.reason === lastReason) return;
      headline.textContent = prompt.headline;
      reason.textContent = prompt.reason ?? '';
      reason.style.display = prompt.reason === null ? 'none' : 'block';
      showBox();
      shown = true;
      lastHeadline = prompt.headline;
      lastReason = prompt.reason;
    },
    dispose() {
      root.remove();
    },
  };
}
