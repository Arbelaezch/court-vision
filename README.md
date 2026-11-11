# Court Vision

> Learn to read the floor. A cartoon basketball game that teaches people who have never played how to move, space the floor, and make the right read, one position and one play at a time.

Court Vision is a browser game built with three.js. You control a single player (starting with the point guard) and run real basketball plays, first with no defenders and heavy guidance, then against defenders who react. Shot-making skill is de-emphasized. What matters is where you move, who you pass to, and whether you take a good look.

**Play it:** `https://<your-github-username>.github.io/court-vision/` *(live once the first deploy completes)*

## Modes

| Mode | What it is | Status |
|---|---|---|
| **Tutorial** | Controls and basketball concepts in plain language | v1 |
| **Practice** | One play, no defenders (cones show where they'd be), heavy guidance | v1 |
| **Scrimmage** | One play, 5-on-5 with live defenders, slower pace, reads matter | v1 |
| **Live Play** | Same as Scrimmage with no guidance | Later |
| **Free Play** | Open game with real-time play calling and full defense | Later |

v1 ships five point guard plays: Give-and-Go, Drive-and-Kick, Dribble Handoff, High Pick-and-Roll, and Horns Set.

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/DESIGN_DOC.md`](docs/DESIGN_DOC.md) | **The design spec and source of truth.** Vision, terminology, scope, mechanics, plays, data system, testing, milestones. |
| [`.factory/decisions.md`](.factory/decisions.md) | Log of significant decisions made during implementation. |
| [`docs/adding-a-play.md`](docs/adding-a-play.md) | How to add a new play or role *(written during M10)*. |
| [`docs/assets.md`](docs/assets.md) | Licenses and sources for any third-party assets *(created when needed)*. |

## Tech

TypeScript, Vite, three.js (version pinned), Vitest. No backend: it's a static site. Game logic lives in a headless simulation core with no three.js dependency, and plays, roles and defensive coverages are data, not code.

## Getting started

Requires Node 24 (see `.nvmrc`; minimum 22.13).

```bash
npm install
npm run dev           # local dev server
npm run test          # unit tests (Vitest)
npm run typecheck     # TypeScript checks
npm run lint          # ESLint
npm run format        # format with Prettier
npm run format:check  # check formatting
npm run build         # production build into dist/
npm run preview       # serve the production build locally
```

Because Vite `base` is `/court-vision/`, `npm run dev` serves at `http://localhost:5173/court-vision/`.

### Project layout

`src/` has eight layers:

- `sim`, `content`, `ai`: headless, no three.js or DOM
- `input`, `render`, `ui`, `audio`, `app`: browser-facing

`npm run lint` fails if `src/sim`, `src/content` or `src/ai` import three.js or the browser layers (including dynamic `import()`), or use a listed set of common DOM globals (`window`, `document`, `navigator`, `requestAnimationFrame`, `addEventListener`, `fetch`, DOM event and element types, WebGL and audio contexts, and similar; see `DOM_GLOBALS` in `eslint.config.js`). The list is not exhaustive, so unlisted browser globals are not caught.

## Deployment

Pushes to `main` build and deploy to GitHub Pages through GitHub Actions. The Vite `base` option must match the repository path (`/court-vision/`). If you deploy elsewhere (Cloudflare Pages, Netlify), change only `base`.

## For the software factory

1. **Read [`docs/DESIGN_DOC.md`](docs/DESIGN_DOC.md) in full before creating issues.** It is the source of truth. This README is only an overview.
2. Break the work into issues following the milestones in section 15 of the design doc (M0 to M10). Each milestone should leave the project in a runnable, deployable state.
3. Respect the fixed constraints in section 16 ("Where the Factory Has Latitude"): terminology, v1 scope, move philosophy, tactical camera, layered architecture with a headless simulation, and the data-driven play system.
4. Where the design doc is silent, use your judgment in service of its vision and design pillars, and record significant choices in [`.factory/decisions.md`](.factory/decisions.md).
5. Treat the testing strategy (design doc section 13) as part of the product, especially the correct-read and wrong-read play bots.

## License

TBD.