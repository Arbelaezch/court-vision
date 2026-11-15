import {
  AIM_SENSITIVITY_RANGE,
  AUDIO_VOLUME_RANGE,
  CONTROL_ACTIONS,
  CUE_TOGGLE_LABELS,
  DOUBLE_CLICK_WINDOW_RANGE,
  PASS_TARGETING_LABELS,
  controlDevice,
  inputLabel,
  type AudioSettings,
  type ControlSettings,
  type DisplaySettings,
  type ProgressReset,
} from '../app';

export interface ControlsView {
  mount(parent: HTMLElement): () => void;
}

export function createControlsView(opts: {
  doc: Document;
  controls: ControlSettings;
  audio?: AudioSettings;
  display?: DisplaySettings;
  progressReset?: ProgressReset;
}): ControlsView {
  const { doc, controls, audio, display, progressReset } = opts;

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

  function renderAudio(root: HTMLElement, audio: AudioSettings): void {
    const { volume, musicOn, sfxOn } = audio.settings();
    root.appendChild(el('h3', undefined, 'Audio'));
    root.appendChild(
      slider(
        'cv-audio-volume',
        'Volume',
        AUDIO_VOLUME_RANGE,
        volume,
        `${Math.round(volume * 100)}%`,
        (v) => {
          audio.setVolume(v);
        },
      ),
    );
    const toggles = el('div', 'cv-controls-row');
    const music = button(
      'cv-menu-button cv-controls-toggle',
      'Music',
      () => {
        audio.setMusicOn(!musicOn);
      },
      'audio-music',
    );
    music.setAttribute('aria-pressed', String(musicOn));
    toggles.appendChild(music);
    const sfx = button(
      'cv-menu-button cv-controls-toggle',
      'Sound effects',
      () => {
        audio.setSfxOn(!sfxOn);
      },
      'audio-sfx',
    );
    sfx.setAttribute('aria-pressed', String(sfxOn));
    toggles.appendChild(sfx);
    root.appendChild(toggles);
  }

  function toggle(label: string, on: boolean, onClick: () => void, key: string): HTMLElement {
    const b = button('cv-menu-button cv-controls-toggle', label, onClick, key);
    b.setAttribute('aria-pressed', String(on));
    return b;
  }

  function confirmBox(
    text: string,
    confirmLabel: string,
    confirmKey: string,
    cancelKey: string,
    onConfirm: () => void,
    onCancel: () => void,
  ): HTMLElement {
    const box = el('div', 'cv-controls-confirm');
    box.setAttribute('role', 'alert');
    box.appendChild(el('span', undefined, text));
    box.appendChild(button('cv-menu-button', confirmLabel, onConfirm, confirmKey));
    box.appendChild(button('cv-menu-button', 'Cancel', onCancel, cancelKey));
    return box;
  }

  function renderCues(root: HTMLElement, display: DisplaySettings): void {
    const cues = display.cues();
    root.appendChild(el('h3', undefined, 'Cue visibility'));
    root.appendChild(
      el(
        'p',
        'cv-controls-note',
        'Modes still set the most cues you can see. Scrimmage shows fewer than Practice.',
      ),
    );
    const row = el('div', 'cv-controls-row');
    const keys = Object.keys(CUE_TOGGLE_LABELS) as (keyof typeof CUE_TOGGLE_LABELS)[];
    for (const key of keys) {
      const current = cues[key];
      row.appendChild(
        toggle(
          CUE_TOGGLE_LABELS[key],
          current,
          () => {
            display.setCueToggle(key, !current);
          },
          `cue-${key}`,
        ),
      );
    }
    root.appendChild(row);
    const pending = display.pending();
    if (pending !== null) {
      root.appendChild(
        confirmBox(
          `Hide ${CUE_TOGGLE_LABELS[pending.cue].toLowerCase()} in Practice and Scrimmage? Runs still count toward Mastery.`,
          'Hide',
          'cue-confirm',
          'cue-cancel',
          () => {
            display.confirm();
          },
          () => {
            display.cancel();
          },
        ),
      );
    }
  }

  function renderMotion(root: HTMLElement, display: DisplaySettings): void {
    const on = display.reduceMotion();
    root.appendChild(el('h3', undefined, 'Accessibility'));
    const row = el('div', 'cv-controls-row');
    row.appendChild(
      toggle(
        'Reduce motion',
        on,
        () => {
          display.setReduceMotion(!on);
        },
        'motion-reduce',
      ),
    );
    root.appendChild(row);
  }

  function renderProgressReset(root: HTMLElement, reset: ProgressReset): void {
    root.appendChild(el('h3', undefined, 'Progress'));
    root.appendChild(
      button(
        'cv-menu-button',
        'Reset progress',
        () => {
          reset.request();
        },
        'progress-reset',
      ),
    );
    if (reset.pending()) {
      root.appendChild(
        confirmBox(
          'Reset all progress? Attempts and successes go to zero and Mastered is removed for every play and mode, and seen tooltips are cleared. This cannot be undone.',
          'Reset progress',
          'progress-confirm',
          'progress-cancel',
          () => {
            reset.confirm();
          },
          () => {
            reset.cancel();
          },
        ),
      );
    }
    const status = el('p', undefined, reset.message() ?? '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(status);
  }

  // Which confirmation boxes the previous render showed, for the focus rules.
  let prevCueBox: string | null = null;
  let prevResetBox = false;

  function render(root: HTMLElement): void {
    const focusKey = doc.activeElement?.getAttribute('data-focus-key') ?? null;
    focusables = new Map();
    root.replaceChildren();
    const settings = controls.settings();
    const bindings = controls.bindings();
    const capture = controls.capture();

    if (audio !== undefined) renderAudio(root, audio);
    if (display !== undefined) {
      renderCues(root, display);
      renderMotion(root, display);
    }

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

    if (progressReset !== undefined) renderProgressReset(root, progressReset);

    const cueBox = display?.pending()?.cue ?? null;
    const resetBox = progressReset?.pending() ?? false;
    const target =
      (cueBox !== null && prevCueBox === null ? focusables.get('cue-cancel') : undefined) ??
      (resetBox && !prevResetBox ? focusables.get('progress-cancel') : undefined) ??
      (focusKey !== null ? focusables.get(focusKey) : undefined) ??
      (prevCueBox !== null && cueBox === null ? focusables.get(`cue-${prevCueBox}`) : undefined) ??
      (prevResetBox && !resetBox ? focusables.get('progress-reset') : undefined);
    target?.focus();
    prevCueBox = cueBox;
    prevResetBox = resetBox;
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
      const unsubscribeAudio = audio?.onChange(() => {
        render(root);
      });
      const unsubscribeDisplay = display?.onChange(() => {
        render(root);
      });
      const unsubscribeReset = progressReset?.onChange(() => {
        render(root);
      });
      render(root);

      return () => {
        unsubscribe();
        unsubscribeAudio?.();
        unsubscribeDisplay?.();
        unsubscribeReset?.();
        controls.cancel();
        display?.cancel();
        progressReset?.cancel();
        root.remove();
      };
    },
  };
}
