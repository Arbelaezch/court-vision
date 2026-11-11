import './style.css';
import { mountAudio } from './audio';
import { mountInput } from './input';
import { mountRenderer } from './render';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('Court Vision: #app element not found');
}
mountRenderer(app);
// practice-slice wires `audio.engine.handleEvent` as the game-event sink.
const audio = mountAudio();
void audio;
// practice-slice consumes `input.input` (held state and press-action events).
const input = mountInput();
void input;
