import './style.css';
import {
  bootApp,
  createAudioSettings,
  createControlSettings,
  createDisplaySettings,
  createHumanInput,
  createProgressReset,
  createSaveStore,
  handleMenuEvent,
} from './app';
import { bindUiClicks, mountAudio } from './audio';
import { mountInput } from './input';
import { mountRenderer, parseDevView } from './render';
import {
  createControlsView,
  createCuePromptOverlay,
  createReduceMotionOutput,
  createRunHud,
  createScreenMenus,
} from './ui';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('Court Vision: #app element not found');
}
const dev = parseDevView(new URLSearchParams(window.location.search).get('dev'));
const mounted = mountRenderer(app, { dev });
const audio = mountAudio();
const { input } = mountInput();

if (dev === null) {
  const store = createSaveStore();
  const controls = createControlSettings({ store, input });
  const audioSettings = createAudioSettings({ store, output: audio.engine });
  const display = createDisplaySettings({ store, output: createReduceMotionOutput(document) });
  const progressReset = createProgressReset({ store });
  bindUiClicks(app, () => {
    audio.engine.play('uiClick');
  });
  const hud = createRunHud({ container: app, doc: document });
  const prompt = createCuePromptOverlay({ container: app, doc: document });
  prompt.show(null);
  const human = createHumanInput({
    held: () => ({
      axes: input.moveAxes(),
      sprint: input.isHeld('sprint'),
      pivot: input.isHeld('pivot'),
    }),
    aimAt: () => {
      const p = input.pointer();
      return p ? mounted.pointerToCourt(p.x, p.y) : null;
    },
    targeting: () => {
      const s = store.get('settings');
      return { mode: s.passTargeting, aimSensitivity: s.aimSensitivity };
    },
  });
  const flow = bootApp({
    store,
    renderer: {
      drawRun(controller, frame) {
        mounted.run?.draw(controller, frame);
        hud.update(frame.hud);
        prompt.show(frame.prompt);
      },
      clear() {
        mounted.run?.clear();
        hud.update(null);
        prompt.show(null);
      },
    },
    tutorialRenderer: {
      drawTutorial(frame) {
        mounted.run?.drawGame({
          game: frame.game,
          humanRole: frame.humanRole,
          steps: frame.steps,
          cues: [],
        });
        hud.update(frame.hud);
        prompt.show(frame.prompt);
      },
      clearTutorial() {
        mounted.run?.clear();
        hud.update(null);
        prompt.show(null);
      },
    },
    tutorialActionsFor: human.actionsForGame,
    visibility: { target: document, isHidden: () => document.hidden },
    actionsFor: human.actionsFor,
    stepSinks: [audio.engine.handleStep],
    onPress: human.press,
  });
  const menus = createScreenMenus({
    container: app,
    doc: document,
    settingsView: createControlsView({
      doc: document,
      controls,
      audio: audioSettings,
      display,
      progressReset,
    }),
    onEvent: (e) => {
      handleMenuEvent(flow, input, human, e);
    },
  });
  const render = (): void => {
    const state = flow.state();
    menus.show(state, flow.labels());
    if (state.screen !== 'inRun' && state.screen !== 'paused' && state.screen !== 'tutorial') {
      hud.update(null);
      prompt.show(null);
    }
  };
  flow.onChange(render);
  render();
  input.onAction((a) => {
    flow.handleAction(a);
  });
  let previous: number | null = null;
  const tick = (now: number): void => {
    flow.frame(previous === null ? 0 : now - previous);
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
