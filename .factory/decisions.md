# Decisions

Questions about the product or its implementation and how they were settled. Recorded by the factory; `question-resolver` and the planners treat these as source documents.

## Is Scrimmage 'heavy guidance' or Reduced cues?
- Kind: product
- Decision: Reduced cues; fix terminology wording at DESIGN_DOC.md:46
- Decided by: user on 2026-11-11
- Why: clarifies the MVP document
- Source: DESIGN_DOC.md:46,146,250

## Is red mistake text required for v1?
- Kind: product
- Decision: No. It can slip to v1.1 or later and is not a priority.
- Decided by: user on 2026-11-11
- Why: clarifies the MVP document
- Source: DESIGN_DOC.md:258,412,474

## Where do the spec and decisions live?
- Kind: implementation
- Decision: Spec at docs/DESIGN_DOC.md; decisions at .factory/decisions.md. Update existing paths to match.
- Decided by: user on 2026-11-11
- Why: resolves path contradiction between README, spec and factory
- Source: README.md:25,54; DESIGN_DOC.md:5,481

## How to handle stale .claude/harness.toml?
- Kind: implementation
- Decision: Update it in the M0 scaffold issue with typecheck, lint, test, build gates
- Decided by: user on 2026-11-11
- Why: spec fixes the stack
- Source: .claude/harness.toml; DESIGN_DOC.md:89

## g1: Which coverage drives Practice cones and how are looks graded?
- Kind: product
- Decision: Practice is fixed and simple: cones use the single most standard defense placement, never varied. No look grading in Practice; it is pass/fail on whether the user executed the play correctly.
- Decided by: user on 2026-11-11
- Why: keeps Practice simple
- Source: DESIGN_DOC.md:214,238,248,351

## g2: Which Bad outcomes reset a run; does Good count as success?
- Kind: product
- Decision: Only a wrong pass (wrong teammate) or turnover resets with whistle. In Scrimmage a Good (suboptimal read that still works, e.g. chest pass instead of bounce pass) lets the play continue and counts as success, with the result banner distinguishing it from a Perfect outcome. Great/Good/Bad grading is mainly for instant feedback in later Free Play.
- Decided by: user on 2026-11-11
- Why: teach-not-test philosophy
- Source: DESIGN_DOC.md:224-229,242-243,252-253

## g3: How strict is following the play?
- Kind: product
- Decision: Strict in both modes: off-script actions are Bad and reset (whistle). Exception in Scrimmage: a suboptimal read whose outcome still works is allowed to continue and graded Good, not Perfect. Pass to the wrong teammate = whistle and reset. No idle handling in Practice.
- Decided by: user on 2026-11-11
- Why: defines run strictness
- Source: DESIGN_DOC.md:239,242,376

## g4: Are screens/handoffs automatic or called?
- Kind: product
- Decision: Automatic in Practice and Scrimmage. Player-called only in future Free Play.
- Decided by: user on 2026-11-11
- Why: beginners never stuck
- Source: DESIGN_DOC.md:170,187,348

## g5: Steals and blocks in Scrimmage?
- Kind: product
- Decision: No steals on the dribbler. Blocks are possible when the player takes a contested shot a defender can reach. Interceptions, shot-clock violations and out of bounds remain turnovers. Scrimmage lets the player operate freely and punishes bad mistakes.
- Decided by: user on 2026-11-11
- Why: defines turnover types
- Source: DESIGN_DOC.md:208,201,252

## g6: How is the controls tutorial built?
- Kind: product
- Decision: A separate scripted sandbox, not scenario data. Tooltip-seen state persistence was not specified; assume persisted in localStorage and cleared by reset progress.
- Decided by: user on 2026-11-11
- Why: tutorial design
- Source: DESIGN_DOC.md:102,357,404-406

## g7: Number keys 1-4 mapping?
- Kind: product
- Decision: Position order: 1=SG, 2=SF, 3=PF, 4=C. Each teammate shows a key badge above the head while the PG has the ball; cues use key number plus role name.
- Decided by: user on 2026-11-11
- Why: accepted proposal
- Source: DESIGN_DOC.md:181,276,135

## g8: What does the cue visibility setting change?
- Kind: product
- Decision: Per-cue toggles (floor arrows, target rings, prompts), default on, confirm when turning any off. Runs still count toward Mastery. Mode cue level is the ceiling.
- Decided by: user on 2026-11-11
- Why: accepted proposal
- Source: DESIGN_DOC.md:419,141-146

## g9: What does the play-select preview show?
- Kind: product
- Decision: One preview viewport for the selected/hovered play; correct-read bot loops through each coverage with live defenders, labeled in plain language.
- Decided by: user on 2026-11-11
- Why: accepted proposal
- Source: DESIGN_DOC.md:353,400,96

## g10: Single click vs double-click lob
- Kind: implementation
- Decision: Single click waits out the configurable double-click window (default 220 ms) with a small charging indicator; lob also bindable to a dedicated key.
- Decided by: assumed on 2026-11-11
- Why: Outcomes are situational so latency costs little; avoids binding collision
- Source: DESIGN_DOC.md:182-184,191

## g11: CI smoke test and Pages
- Kind: implementation
- Decision: Vitest smoke test booting app state machine and sim with a stub renderer; Playwright smoke test only if cheap in M10. User enables Pages with Source: GitHub Actions before the deploy step.
- Decided by: assumed on 2026-11-11
- Why: Avoids heavy headless WebGL dependency in CI; Pages setting is user-only
- Source: DESIGN_DOC.md:438,115-117

## g12: Attempt definition and schema migrations
- Kind: implementation
- Decision: Attempt counted when a run ends in success or mistake; quitting/restarting from pause does not count. On schema bump run explicit migrations; if missing or corrupt, keep valid fields, reset the bad section, console.warn.
- Decided by: assumed on 2026-11-11
- Why: Simple counters and safe fallback
- Source: DESIGN_DOC.md:263,94

## Bad look or blocked on-script shot: reset or unsuccessful run?
- Kind: product
- Decision: A blocked shot is a turnover and triggers whistle and reset. A Bad look is a bad (unsuccessful) run without a mistake reset. Resolves the g2/g3/spec:252 disagreement.
- Decided by: user on 2026-11-11
- Why: clarifies run outcome rules
- Source: DESIGN_DOC.md:252; issues #18, #20, #21, #31

## Practice standard coverage per play, one chosen by the author?
- Kind: product
- Decision: Yes: each play marks one coverage as its Practice standard; correct path is that coverage's best read.
- Decided by: user on 2026-11-11
- Why: confirms planner assumption
- Source: g1

## Call-for-screen key in v1?
- Kind: product
- Decision: Rebindable but inert in v1, excluded from the controls tutorial; used in future Free Play.
- Decided by: user on 2026-11-11
- Why: confirms planner assumption
- Source: g4

## Tutorial tooltip-seen persistence?
- Kind: implementation
- Decision: Persisted in localStorage, cleared by reset progress.
- Decided by: user on 2026-11-11
- Why: confirms assumption
- Source: g6

## Schema validation library for content data
- Kind: implementation
- Decision: Hand-written zero-dependency validators in `src/content/validate.ts`; no schema library.
- Decided by: assumed on 2026-11-11
- Why: The spec prefers few dependencies, the v1 shapes are small, and we get full control of the file and field error messages. Revisit (e.g. zod) if play/scenario schemas outgrow the helpers.
- Source: DESIGN_DOC.md:103,365,487; issue #6

## Do content role ids come from the sim?
- Kind: implementation
- Decision: `src/content` imports `RoleId`, `TeamSide` and `ROLE_ORDER` from the `src/sim` barrel; sim never imports content.
- Decided by: assumed on 2026-11-11
- Why: One source of truth, the dependency points down to the headless core, and the ESLint layer rules allow it.
- Source: src/sim/state.ts:11-15; eslint.config.js:88-90; issue #6

## Archetype units, body types and cast data format
- Kind: implementation
- Decision: The single tuning file is `src/content/data/archetypes.ts`. `speedMps` (m/s), `accelerationMps2` (m/s^2) and `reachM` (standing reach, m); `strength`, `shooting.{rim,midRange,three}`, `passing`, `ballSecurity` and `defensiveAwareness` are integers 0-100, higher is better. Body types are `guard|wing|big`. Content data is TS modules exporting plain literals plus a file-path constant; team colors are `#rrggbb` in `src/content/data/teams.ts`.
- Decided by: assumed on 2026-11-11
- Why: Keeps tuning in one place with explicit units, and needs no JSON module configuration.
- Source: DESIGN_DOC.md:134-137,199-201,359-361; issue #6

## Run a fix round for the should_fix (deploy guard test) and re-review, or open the PR as is?
- Kind: implementation
- Decision: Run a fix round and re-review
- Decided by: user on 2026-11-11

## Default dedicated keys for floater, call-for-screen, pivot and lob?
- Kind: implementation
- Decision: Floater=KeyE, call for screen=KeyQ, pivot=KeyC (hold), lob=KeyR; all rebindable data, keys identified by KeyboardEvent.code
- Decided by: assumed on 2026-11-11
- Why: Spec names none; low-impact, reversible bindings data

## What is the 'current version' for the v1 migration test in #8?
- Kind: implementation
- Decision: CURRENT_VERSION = 2 with a real explicit v1->v2 migration, tested with a v1 fixture
- Decided by: assumed on 2026-11-12
- Why: Otherwise the migration test would exercise a no-op

## Run another fix round after round-1 ESCALATE (3 should_fix) or open PR as is?
- Kind: implementation
- Decision: Run a fix round for R1-1..R1-3 and re-review before the PR
- Decided by: assumed on 2026-11-12
- Why: Earlier user decision chose a fix round for a should_fix; R1-3 affects an API the next issue builds on

## Gamepad binding format and default layout for #10?
- Kind: implementation
- Decision: Gamepad inputs are strings in Binding.input: GamepadButton<N>, GamepadAxis<N>+/-; standard layout defaults (left stick move, A chest, B bounce, Y lob, X shoot, RB floater, LB screen, RT sprint, LT pivot, Start pause, dpad targets 1-4); dead zone 0.15 radial
- Decided by: assumed on 2026-11-13
- Why: Spec names no gamepad format; low-impact and reversible data

## What does aimSensitivity mean for pass targeting, and which input wins in Both mode?
- Kind: product
- Decision: Cone of 45 x sensitivity degrees, falling back to the closest angle when the cone is empty; a number key always wins in Both
- Decided by: user on 2026-11-13

## How do factory sessions run prettier, when npx prettier is refused?
- Kind: implementation
- Decision: Use the repo's npm scripts: npm run format (write) and npm run format:check (check). They are already allowed; do not ask for an npx prettier rule.
- Decided by: user on 2026-11-13
- Why: Blocker on #62: npx prettier is outside the factory allow list, npm run * is allowed
- Source: package.json scripts

## Hidden tab behavior for the run clock?
- Kind: implementation
- Decision: Hiding pauses the run and freezes all sim time incl. shot clock; showing the tab never auto-resumes; first frame after resume is discarded; pausing emits no sim events and counts no attempt
- Decided by: assumed on 2026-11-14
- Why: Conservative, reversible; pause menu (#24) not built yet; consistent with g12

## How should a pass of the wrong type to the correct teammate be graded in each mode?
- Kind: product
- Decision: Option 1: Scrimmage: Good (continues, counts as success); Practice: still follows the path and may succeed
- Decided by: user on 2026-11-14

## How should a set defender's guard position relate to the scripted return pass lane?
- Kind: product
- Decision: Option 1: change guard so a set defender stays between its man and the rim but shifts off its man's passing lanes; scripted return passes stay open and interceptions stay possible elsewhere
- Decided by: user on 2026-11-14

## Where should the Give-and-Go SF help spot sit so the kick-out pass is not intercepted by a live defender?
- Kind: implementation
- Decision: Moved from (-1.5,-3.5) to (-1,-4.9) in giveAndGo.ts so help keeps clear of the holder-to-own-man lane
- Decided by: assumed on 2026-11-14
- Why: Live help defenders otherwise intercepted the scripted kick-out pass; small reversible content tweak

## Open the PR for #21 with R3-1 as a known follow-up, or run another fix round?
- Kind: product
- Decision: Option 1: open the PR as is. Do not file a follow-up issue; instead comment the R3-1 situation on the PR (guard lane-shift target can jump ~2.5 m when a lane angle crosses LANE_MIN_FACING, untested) and note it as something to test if guard movement gives issues
- Decided by: user on 2026-11-14

## Which coverage is Give-and-Go's Practice standard?
- Kind: product
- Decision: ballWatch (Ball-watching defender). Practice cones follow its script: in entry all five cones guard their men; in cut the PG's cone sags to (1.5, 0.5) watching the ball. The standard path is chest pass to SG, cut to (0.8, -4), take the return pass, shoot (layup). helpOnCut is Scrimmage-only.
- Decided by: assumed on 2026-11-14
- Why: the play's base lesson and the most standard placement (g1); helpOnCut is the counter read
- Source: DESIGN_DOC.md:278-286; g1; issue #22; src/content/data/plays/giveAndGo.ts

## Which Give-and-Go actions are graded decision points?
- Kind: implementation
- Decision: One decision point, finishRead (PG, finish phase) with layup, floater and kickToWing. The entry pass and the cut are the same in every coverage, so they stay track steps (entry pass to SG is on path, a pass to anyone else is a wrong-teammate whistle; the cut is movement) rather than decision points whose only option is Great everywhere.
- Decided by: assumed on 2026-11-14
- Why: a decision that is Great in every coverage teaches no read and would cap a bounce-pass entry at Good in Scrimmage; the coverages change the best read at the finish (DESIGN_DOC.md:274)
- Source: DESIGN_DOC.md:272-285; issue #22

## What are Give-and-Go's Reduced (Scrimmage) cues?
- Kind: product
- Decision: entry: target ring on SG; cut: floor arrow to the cut spot (0.8, -4); finish: the prompt 'Read the help' with no reason, so it marks the moment without naming the read.
- Decided by: assumed on 2026-11-14
- Why: movement cues remain and decision cues are subtler in Scrimmage; the schema has no delay field
- Source: DESIGN_DOC.md:146,250; issue #22

## Does an unsuccessful (Bad look) run count as an attempt?
- Kind: implementation
- Decision: Yes: unsuccessful adds to attempts but not successes, like a mistake; only quit/restart via the controller leaves counters unchanged
- Decided by: assumed on 2026-11-14
- Why: g12 separates ended runs from abandoned ones; DESIGN_DOC.md:252 calls a Bad look an unsuccessful run; cheap to change

## Screen-flow details for #24: hidden-tab pause, Esc while paused, Esc on other screens, quit target
- Kind: implementation
- Decision: Hidden tab opens pause menu and does not auto-resume; Esc while paused resumes; Esc on Play Select/placeholders goes to main menu; quit returns to Play Select for the same mode; Practice opens Play Select; Scrimmage is a placeholder
- Decided by: assumed on 2026-11-14
- Why: Low-impact, reversible UI behaviour not settled by the documents
