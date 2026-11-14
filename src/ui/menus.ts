import type { MenuLabels, PlayModeStatus, ScreenEvent, ScreenState } from '../app';

export interface ScreenMenus {
  show(state: ScreenState, labels: MenuLabels): void;
  dispose(): void;
}

const PLACEHOLDER_TITLES = {
  tutorial: 'Tutorial',
  scrimmage: 'Scrimmage',
  settings: 'Settings',
} as const;

function sameScreen(a: ScreenState | null, b: ScreenState): boolean {
  if (a === null || a.screen !== b.screen) return false;
  const modeA = 'modeId' in a ? a.modeId : undefined;
  const modeB = 'modeId' in b ? b.modeId : undefined;
  const playA = 'playId' in a ? a.playId : undefined;
  const playB = 'playId' in b ? b.playId : undefined;
  return modeA === modeB && playA === playB;
}

export function createScreenMenus(opts: {
  container: HTMLElement;
  doc: Document;
  onEvent: (e: ScreenEvent) => void;
}): ScreenMenus {
  const { container, doc, onEvent } = opts;
  const root = doc.createElement('div');
  root.className = 'cv-screens';
  container.appendChild(root);
  let last: ScreenState | null = null;

  function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className: string, label: string, event: ScreenEvent): HTMLElement {
    const b = el('button', className, label);
    b.setAttribute('type', 'button');
    b.addEventListener('click', () => {
      onEvent(event);
    });
    return b;
  }

  function panel(title: string, level: 'h1' | 'h2'): HTMLElement {
    const p = el('div', 'cv-menu');
    p.appendChild(el(level, undefined, title));
    return p;
  }

  function masteredBadge(): HTMLElement {
    const badge = el('span', 'cv-mastered-badge');
    const icon = el('span', 'cv-mastered-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    badge.appendChild(icon);
    badge.appendChild(el('span', 'cv-mastered-text', 'Mastered'));
    return badge;
  }

  function statusFor(labels: MenuLabels, playId: string, modeId: string): PlayModeStatus {
    const found = labels.progress
      .find((r) => r.playId === playId)
      ?.modes.find((m) => m.modeId === modeId);
    return found ?? { modeId, attempts: 0, successes: 0, mastered: false };
  }

  function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  function build(state: ScreenState, labels: MenuLabels): void {
    const modeName = (modeId: string): string => labels.modeNames[modeId] ?? modeId;
    const playName = (playId: string): string =>
      labels.plays.find((p) => p.id === playId)?.name ?? playId;
    switch (state.screen) {
      case 'mainMenu': {
        const p = panel('Court Vision', 'h1');
        const items: [string, ScreenEvent][] = [
          ['Tutorial', { type: 'openTutorial' }],
          ['Practice', { type: 'openPractice' }],
          ['Scrimmage', { type: 'openScrimmage' }],
          ['Settings', { type: 'openSettings' }],
          ['Progress', { type: 'openProgress' }],
        ];
        for (const [label, event] of items) p.appendChild(button('cv-menu-button', label, event));
        root.appendChild(p);
        return;
      }
      case 'tutorial':
      case 'scrimmage':
      case 'settings': {
        const p = panel(PLACEHOLDER_TITLES[state.screen], 'h2');
        p.appendChild(el('p', undefined, 'Coming soon.'));
        p.appendChild(button('cv-menu-button', 'Back', { type: 'back' }));
        root.appendChild(p);
        return;
      }
      case 'progress': {
        const p = panel('Progress', 'h2');
        p.appendChild(
          el(
            'p',
            'cv-progress-note',
            `A play is Mastered in a mode after ${labels.masteredSuccesses} successful runs.`,
          ),
        );
        const table = el('table', 'cv-progress-table');
        const headRow = el('tr');
        for (const h of ['Play', 'Mode', 'Attempts', 'Successes', 'Mastered']) {
          const th = el('th', undefined, h);
          th.setAttribute('scope', 'col');
          headRow.appendChild(th);
        }
        const thead = el('thead');
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = el('tbody');
        for (const play of labels.plays) {
          for (const mode of labels.progressModes) {
            const status = statusFor(labels, play.id, mode.id);
            const tr = el('tr');
            const rowHead = el('th', undefined, play.name);
            rowHead.setAttribute('scope', 'row');
            tr.appendChild(rowHead);
            tr.appendChild(el('td', undefined, mode.name));
            tr.appendChild(el('td', undefined, String(status.attempts)));
            tr.appendChild(el('td', undefined, String(status.successes)));
            const cell = el('td');
            if (status.mastered) cell.appendChild(masteredBadge());
            else cell.textContent = 'Not yet';
            tr.appendChild(cell);
            tbody.appendChild(tr);
          }
        }
        table.appendChild(tbody);
        p.appendChild(table);
        p.appendChild(button('cv-menu-button', 'Back', { type: 'back' }));
        root.appendChild(p);
        return;
      }
      case 'playSelect': {
        const p = panel(`${modeName(state.modeId)}: pick a play`, 'h2');
        const list = el('ol', 'cv-play-list');
        for (const play of labels.plays) {
          const li = el('li');
          const b = el('button', 'cv-play-button');
          b.setAttribute('type', 'button');
          b.appendChild(el('span', 'cv-play-name', play.name));
          b.appendChild(el('span', 'cv-play-blurb', play.blurb));
          const status = statusFor(labels, play.id, state.modeId);
          b.appendChild(
            el(
              'span',
              'cv-play-progress',
              `${plural(status.attempts, 'attempt', 'attempts')} · ${plural(status.successes, 'success', 'successes')}`,
            ),
          );
          if (status.mastered) b.appendChild(masteredBadge());
          b.addEventListener('click', () => {
            onEvent({ type: 'selectPlay', playId: play.id });
          });
          li.appendChild(b);
          list.appendChild(li);
        }
        p.appendChild(list);
        p.appendChild(button('cv-menu-button', 'Back', { type: 'back' }));
        root.appendChild(p);
        return;
      }
      case 'inRun': {
        const hud = el(
          'div',
          'cv-hud',
          `${modeName(state.modeId)} · ${playName(state.playId)} (Esc to pause)`,
        );
        hud.setAttribute('role', 'status');
        root.appendChild(hud);
        return;
      }
      case 'paused': {
        const p = el('div', 'cv-menu');
        p.setAttribute('role', 'dialog');
        p.setAttribute('aria-modal', 'true');
        p.setAttribute('aria-label', 'Paused');
        p.appendChild(el('h2', undefined, 'Paused'));
        p.appendChild(el('p', undefined, playName(state.playId)));
        const resume = button('cv-menu-button', 'Resume', { type: 'resume' });
        p.appendChild(resume);
        p.appendChild(button('cv-menu-button', 'Restart', { type: 'restart' }));
        p.appendChild(button('cv-menu-button', 'Quit', { type: 'quit' }));
        root.appendChild(p);
        resume.focus();
        return;
      }
      default: {
        const unreachable: never = state;
        throw new Error(`Court Vision: unknown screen ${JSON.stringify(unreachable)}`);
      }
    }
  }

  return {
    show(state, labels) {
      if (sameScreen(last, state)) return;
      last = state;
      root.replaceChildren();
      root.className = state.screen === 'inRun' ? 'cv-screens' : 'cv-screens cv-screens-backdrop';
      build(state, labels);
    },
    dispose() {
      root.remove();
    },
  };
}
