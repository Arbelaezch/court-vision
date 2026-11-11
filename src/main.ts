import './style.css';
import { mountRenderer } from './render';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('Court Vision: #app element not found');
}
mountRenderer(app);
