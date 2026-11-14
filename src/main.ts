import './style.css';
import { bootApp, createSaveStore } from './app';
import { mountAudio } from './audio';
import { mountInput } from './input';
import { mountRenderer, parseDevView } from './render';
import { createScreenMenus } from './ui';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('Court Vision: #app element not found');
}
const dev = parseDevView(new URLSearchParams(window.location.search).get('dev'));
mountRenderer(app, { dev });
// practice-slice wires `audio.engine.handleEvent` as the game-event sink.
const audio = mountAudio();
void audio;
const { input } = mountInput();

if (dev === null) {
  const store = createSaveStore();
  // practice-slice connects `GameState` drawing and input `actionsFor` here.
  const flow = bootApp({
    store,
    renderer: { drawRun() {}, clear() {} },
    visibility: { target: document, isHidden: () => document.hidden },
  });
  const menus = createScreenMenus({
    container: app,
    doc: document,
    onEvent: (e) => {
      flow.send(e);
    },
  });
  const render = (): void => {
    menus.show(flow.state(), flow.labels());
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
