import {
  AIM_SENSITIVITY_RANGE,
  CONTROL_ACTIONS,
  DOUBLE_CLICK_WINDOW_RANGE,
  PASS_TARGETING_LABELS,
  controlDevice,
  inputLabel,
  type ControlSettings,
} from '../app';

export interface ControlsView {
  mount(parent: HTMLElement): () => void;
}

export function createControlsView(opts: {
  doc: Document;
  controls: ControlSettings;
}): ControlsView {
  const { doc, controls } = opts;

  function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Focusable elements of the current render by stable key, so focus survives re-rendering.
  let focusables = new Map<string, HTMLElement>();

  function button(
    className: string,
    label: string,
    onClick: () => void,
    key?: string,
  ): HTMLElement {
    const b = el('button', className, label);
    b.setAttribute('type', 'button');
    if (key !== undefined) {
      b.setAttribute('data-focus-key', key);
      focusables.set(key, b);
    }
    b.addEventListener('click', onClick);
    return b;
  }

  function slider(
    id: string,
    label: string,
    range: { min: number; max: number; step: number },
    value: number,
    readout: string,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = el('div', 'cv-controls-row');
    const lab = el('label', undefined, label);
    lab.setAttribute('for', id);
    const input = el('input') as HTMLInputElement;
    input.setAttribute('type', 'range');
    input.setAttribute('id', id);
    input.setAttribute('data-focus-key', id);
    focusables.set(id, input);
    input.setAttribute('min', String(range.min));
    input.setAttribute('max', String(range.max));
    input.setAttribute('step', String(range.step));
    input.value = String(value);
    input.addEventListener('change', () => {
      onChange(Number(input.value));
    });
    row.appendChild(lab);
    row.appendChild(input);
    row.appendChild(el('span', 'cv-controls-readout', readout));
    return row;
  }

  function render(root: HTMLElement): void {
    const focusKey = doc.activeElement?.getAttribute('data-focus-key') ?? null;
    focusables = new Map();
    root.replaceChildren();
    const settings = controls.settings();
    const bindings = controls.bindings();
    const capture = controls.capture();

    root.appendChild(el('h3', undefined, 'Controls'));

    const targeting = el('div', 'cv-controls-row');
    targeting.appendChild(el('span', undefined, 'Pass targeting'));
    const modes = Object.keys(PASS_TARGETING_LABELS) as (keyof typeof PASS_TARGETING_LABELS)[];
    for (const mode of modes) {
      const b = button(
        'cv-menu-button cv-controls-toggle',
        PASS_TARGETING_LABELS[mode],
        () => {
          controls.setPassTargeting(mode);
        },
        `mode-${mode}`,
      );
      b.setAttribute('aria-pressed', String(settings.passTargeting === mode));
      targeting.appendChild(b);
    }
    root.appendChild(targeting);

    root.appendChild(
      slider(
        'cv-double-click-window',
        'Double-click window',
        DOUBLE_CLICK_WINDOW_RANGE,
        settings.doubleClickWindowMs,
        `${settings.doubleClickWindowMs} ms`,
        (v) => {
          controls.setDoubleClickWindowMs(v);
        },
      ),
    );
    root.appendChild(
      slider(
        'cv-aim-sensitivity',
        'Aim sensitivity',
        AIM_SENSITIVITY_RANGE,
        settings.aimSensitivity,
        `${settings.aimSensitivity.toFixed(2)}x (${Math.min(180, 45 * settings.aimSensitivity)}° cone)`,
        (v) => {
          controls.setAimSensitivity(v);
        },
      ),
    );

    const table = el('table', 'cv-bindings');
    const thead = el('thead');
    const headRow = el('tr');
    for (const h of ['Action', 'Keyboard / mouse', 'Gamepad']) {
      const th = el('th', undefined, h);
      th.setAttribute('scope', 'col');
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const { action, label } of CONTROL_ACTIONS) {
      const tr = el('tr');
      const rowHead = el('th', undefined, label);
      rowHead.setAttribute('scope', 'row');
      tr.appendChild(rowHead);
      for (const device of ['keyboard', 'gamepad'] as const) {
        const cell = el('td');
        bindings.forEach((b, index) => {
          if (b.action !== action || controlDevice(b.input) !== device) return;
          const listening = capture.kind === 'listening' && capture.index === index;
          const slot = button(
            'cv-bind-slot',
            listening ? 'Press…' : inputLabel(b.input, b.gesture),
            () => {
              controls.beginRebind(index);
            },
            `slot-${index}`,
          );
          slot.setAttribute('aria-pressed', String(listening));
          cell.appendChild(slot);
        });
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.appendChild(table);

    const status = el('p', 'cv-controls-status', controls.message() ?? '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(status);

    if (capture.kind === 'conflict') {
      const box = el('div', 'cv-controls-conflict');
      box.setAttribute('role', 'alert');
      box.appendChild(el('span', undefined, controls.message() ?? ''));
      box.appendChild(
        button(
          'cv-menu-button',
          'Swap',
          () => {
            controls.confirmSwap();
          },
          'swap',
        ),
      );
      box.appendChild(
        button(
          'cv-menu-button',
          'Cancel',
          () => {
            controls.cancel();
          },
          'cancel',
        ),
      );
      root.appendChild(box);
    }

    root.appendChild(
      button(
        'cv-menu-button',
        'Reset to defaults',
        () => {
          controls.resetToDefaults();
        },
        'reset',
      ),
    );

    if (focusKey !== null) focusables.get(focusKey)?.focus();
  }

  return {
    mount(parent) {
      const root = el('div', 'cv-controls');
      parent.appendChild(root);

      // Decided at mousedown, so a click that never arrives can't leave a stale flag behind.
      let swallowNextClick = false;

      root.addEventListener(
        'mousedown',
        () => {
          swallowNextClick = controls.capture().kind === 'listening';
        },
        true,
      );
      root.addEventListener(
        'click',
        (e: Event) => {
          if (swallowNextClick) {
            e.preventDefault();
            e.stopPropagation();
          }
          swallowNextClick = false;
        },
        true,
      );

      const unsubscribe = controls.onChange(() => {
        render(root);
      });
      render(root);

      return () => {
        unsubscribe();
        controls.cancel();
        root.remove();
      };
    },
  };
}
