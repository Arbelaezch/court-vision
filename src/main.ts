import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('Court Vision: #app element not found');
}
app.textContent = 'Court Vision';
