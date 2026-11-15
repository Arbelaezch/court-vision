import type { GlossaryEntry } from '../content';

export interface ConceptTooltipOverlay {
  show(entries: readonly GlossaryEntry[]): void;
  dispose(): void;
}

// First-time concept tooltips: display only (pointer-events none), no transition or animation.
export function createConceptTooltipOverlay(opts: {
  container: HTMLElement;
  doc: Document;
}): ConceptTooltipOverlay {
  const { container, doc } = opts;
  const root = doc.createElement('div');
  root.className = 'cv-concept-tooltips';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.style.cssText =
    'position: fixed; top: 72px; right: 16px; max-width: 320px; pointer-events: none';
  container.appendChild(root);

  let lastKey = '';

  const clearChildren = (): void => {
    while (root.firstChild !== null) root.removeChild(root.firstChild);
  };

  return {
    show(entries) {
      const key = entries.map((e) => e.id).join('|');
      if (key === lastKey) return;
      lastKey = key;
      clearChildren();
      for (const entry of entries) {
        const box = doc.createElement('div');
        box.className = 'cv-concept-tooltip';
        box.style.cssText =
          'background: rgba(0,0,0,0.75); color: #fff; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px';
        const title = doc.createElement('div');
        title.style.cssText = 'font: bold 18px sans-serif';
        title.textContent = `New: ${entry.term}`;
        const body = doc.createElement('div');
        body.style.cssText = 'font: 16px sans-serif; margin-top: 4px';
        body.textContent = entry.text;
        box.appendChild(title);
        box.appendChild(body);
        root.appendChild(box);
      }
    },
    dispose() {
      root.remove();
    },
  };
}
