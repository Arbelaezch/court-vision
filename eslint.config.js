import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const HEADLESS_MSG =
  'src/sim, src/content and src/ai must run headless (no three.js, DOM or browser-layer imports). See docs/DESIGN_DOC.md section 4.';

const DETERMINISM_MSG =
  'src/sim, src/content and src/ai must be deterministic: use the seeded RNG (src/sim/rng.ts) and fixed-step ticks, not Math.random, wall-clock time or timers. See docs/DESIGN_DOC.md section 4.';

const RENDER_READONLY_MSG =
  'src/render reads simulation state and never steps or writes it (issue #17). Use the ../sim barrel for read-only helpers.';

const NONDETERMINISTIC_GLOBALS = [
  'performance',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestIdleCallback',
  'crypto',
];

const DOM_GLOBALS = [
  'window',
  'self',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'Element',
  'Image',
  'Audio',
  'AudioContext',
  'alert',
  'confirm',
  'prompt',
  'top',
  'parent',
  'frames',
  'history',
  'screen',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
  'scrollX',
  'scrollY',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'getComputedStyle',
  'matchMedia',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'OffscreenCanvas',
  'Node',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'HTMLAudioElement',
  'SVGElement',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'TouchEvent',
  'WheelEvent',
  'CanvasRenderingContext2D',
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
  'webkitAudioContext',
  'OfflineAudioContext',
];

const HEADLESS_FILES = ['sim', 'content', 'ai'].map(
  (layer) => `src/${layer}/**/*.{ts,tsx,mts,cts,js,mjs,cjs}`,
);

const BROWSER_LAYERS = 'render|ui|input|audio|app';
// Cross-layer only: parent-relative (../render) or rooted at src/ (src/render, @/render).
const BROWSER_LAYER_REGEX = `^((\\.\\./)+|(\\.\\./)*src/|@/)(${BROWSER_LAYERS})(/|$)`;

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.harness/', '.factory/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  {
    files: HEADLESS_FILES,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // esquery regexes cannot contain an escaped slash, so use [/] instead.
          selector: 'ImportExpression[source.value=/^three([/]|$)/]',
          message: HEADLESS_MSG,
        },
        {
          selector: `ImportExpression[source.value=/${BROWSER_LAYER_REGEX.replaceAll('/', '[/]')}/]`,
          message: HEADLESS_MSG,
        },
        {
          selector: "ImportExpression:not([source.type='Literal'])",
          message: `${HEADLESS_MSG} Dynamic imports must use a literal specifier so layer boundaries can be checked.`,
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: DETERMINISM_MSG,
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: DETERMINISM_MSG,
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: DETERMINISM_MSG },
        { object: 'Date', property: 'now', message: DETERMINISM_MSG },
        { object: 'performance', property: 'now', message: DETERMINISM_MSG },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: HEADLESS_MSG }],
          patterns: [
            { group: ['three/*', 'three/**'], message: HEADLESS_MSG },
            { regex: BROWSER_LAYER_REGEX, message: HEADLESS_MSG },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS.map((name) => ({ name, message: HEADLESS_MSG })),
        ...NONDETERMINISTIC_GLOBALS.map((name) => ({ name, message: DETERMINISM_MSG })),
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/render/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    ignores: ['src/render/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '../sim', importNames: ['stepGame', 'takeShot'], message: RENDER_READONLY_MSG },
          ],
          patterns: [
            {
              group: ['**/sim/step', '**/sim/takeShot', '**/sim/passing', '**/sim/movement'],
              message: RENDER_READONLY_MSG,
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
