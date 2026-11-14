import type { RunHudModel } from '../app';

export interface RunHud {
  update(hud: RunHudModel | null): void;
  dispose(): void;
}

// In-run HUD: objective line, stamina meter, result banner. `update` runs every frame, so DOM writes
// happen only when a value changes.
export function createRunHud(opts: { container: HTMLElement; doc: Document }): RunHud {
  const { container, doc } = opts;

  function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const root = el('div', 'cv-run-hud');
  const objective = el('div', 'cv-hud-objective');
  const meter = el('div', 'cv-stamina');
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Stamina');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '1');
  const fill = el('div', 'cv-stamina-fill');
  meter.appendChild(fill);
  const banner = el('div', 'cv-result-banner');
  banner.setAttribute('role', 'status');
  root.appendChild(objective);
  root.appendChild(meter);
  root.appendChild(banner);
  root.hidden = true;
  banner.hidden = true;
  container.appendChild(root);

  let lastObjective: string | null = null;
  let lastStamina: number | null = null;
  let lastBannerKey: string | null = null;

  function update(hud: RunHudModel | null): void {
    if (hud === null) {
      if (!root.hidden) root.hidden = true;
      return;
    }
    if (root.hidden) root.hidden = false;
    if (hud.objective !== lastObjective) {
      objective.textContent = hud.objective;
      lastObjective = hud.objective;
    }
    const stamina = Math.min(1, Math.max(0, hud.stamina));
    if (stamina !== lastStamina) {
      meter.setAttribute('aria-valuenow', String(stamina));
      fill.style.width = `${Math.round(stamina * 100)}%`;
      lastStamina = stamina;
    }
    const key = hud.banner === null ? '' : `${hud.banner.tone}|${hud.banner.text}`;
    if (key !== lastBannerKey) {
      lastBannerKey = key;
      if (hud.banner === null) {
        banner.hidden = true;
        banner.textContent = '';
      } else {
        banner.className = `cv-result-banner ${
          hud.banner.tone === 'success' ? 'cv-result-success' : 'cv-result-neutral'
        }`;
        banner.textContent = hud.banner.text;
        banner.hidden = false;
      }
    }
  }

  return {
    update,
    dispose() {
      root.remove();
    },
  };
}
