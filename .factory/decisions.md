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

## Should existing saves with musicOn true be migrated to off?
- Kind: implementation
- Decision: Yes: save v2 to v3 migration sets music off; no screen could change it before, so a saved on is the old default
- Decided by: assumed on 2026-11-14
- Why: Issue says music is off unless enabled; reversible

## Whose sprint footsteps play, and when does screen contact sound?
- Kind: implementation
- Decision: Footsteps only for the controlled player; screen contact plays when the screen is set (no separate contact event in the sim)
- Decided by: assumed on 2026-11-14
- Why: Low-impact audio tuning, easily changed

## Does music keep playing across screens and while paused?
- Kind: implementation
- Decision: Yes, music continues across screens and while a run is paused
- Decided by: assumed on 2026-11-14
- Why: Low-impact, reversible behaviour choice

## How does a coverage switch defenders?
- Kind: implementation
- Decision: a coverage defender step with action 'switch' must name guards: <role>. From that phase on, the defender guards that role's man with the guard behaviour (cushion and lane-shift). guards is rejected on any other action and when it names the defender's own role.
- Decided by: assumed on 2026-11-14
- Why: defenders are keyed by setup role and switch was spot-only, so no coverage could hand a defender a new man. A per-step field is shared by every screen play and adds no play-specific engine code.
- Source: issue #35; src/ai/defense.ts; src/content/plays.ts

## Which coverage is Dribble Handoff's Practice standard?
- Kind: implementation
- Decision: overTheTop (Chase over the top). The cones sit on its scripted defender spots. Standard path: PG passes to the C (entry), runs off the C's handoff (automatic), drives to READ_SPOT (-0.6, -2.8), then takes the floater. underTheScreen and switchOnHandoff appear only in Scrimmage.
- Decided by: assumed on 2026-11-14
- Why: g1 says Practice uses the single most standard defense placement; getting downhill off the handoff is the play's base lesson, and under and switch are the counter reads.
- Source: DESIGN_DOC.md:300-309; g1; issue #35

## Which Dribble Handoff actions are graded decision points?
- Kind: implementation
- Decision: one decision, handoffRead, at the read phase. hitScreener (bouncePass to C): overTheTop bad, underTheScreen bad, switchOnHandoff great. downhill (floater): overTheTop great, underTheScreen good, switchOnHandoff great. pullUp (shoot): overTheTop good, underTheScreen great, switchOnHandoff bad. The floater stands for "go downhill" because grading matches only on move and a decision allows one shoot and one floater option. In a switch, hitting the C and attacking the big are both great. The entry pass and the handoff are on-path track steps, and the handoff is automatic (g4).
- Decided by: assumed on 2026-11-14
- Why: issue #35 text for the switch; grading constraints force the move mapping
- Source: issue #35; g4; src/content/plays.ts

## What are Dribble Handoff's Reduced (Scrimmage) cues?
- Kind: implementation
- Decision: entry target ring on the C; handoff and attack floor arrows; read prompt "Read your defender" with no reason.
- Decided by: assumed on 2026-11-14
- Why: matches Give-and-Go's reduced cues: location hints stay, the reasoning is hidden
- Source: issue #35; Give-and-Go decisions

## What difficulty is Dribble Handoff?
- Kind: implementation
- Decision: 3, its number in DESIGN_DOC section 9, so Play Select lists it after Give-and-Go and leaves 2 for Drive-and-Kick.
- Decided by: assumed on 2026-11-14
- Why: keeps the design doc ordering
- Source: DESIGN_DOC.md section 9; issue #35

## How to evidence AC1 without screenshots, and who picks the offense vs defense non-color channel
- Kind: product
- Decision: Option 1: accept unit tests asserting a non-color channel per element plus a PR table, screenshots left to the reviewer; the planner picks data-driven team channels in teams.ts
- Decided by: user on 2026-11-15

## How should the aggressiveCloseout coverage's best read be graded?
- Kind: product
- Decision: Option 3: ship option 1 now (sprint-by graded as the finish/shoot) and open a follow-up issue for play-agnostic sprint/movement grading in the shared engine. Follow-up scope: sprint-by an aggressive closeout is graded positively; letting the closeout happen then recovering is poor but not run-ending; if the rim-side defender then switches to cut off the sprinting attacker, scoring through is okay, but dishing to the newly free teammate is the best next read.
- Decided by: user on 2026-11-15
- Why: Sprinting by an aggressive closeout should be rewarded; recovering after allowing it is weak but not fatal; after the switch, the pass to the free man is the best outcome.

## High Pick-and-Roll (#37): which coverage is the Practice standard?
- Kind: implementation
- Decision: dropBig (Drop coverage); correct read is the pull-up. Coverage ids: dropBig, hedgeRecover, switchOnScreen, cornerHelp; corner help comes from the weak-side corner
- Decided by: assumed on 2026-11-15
- Why: Drop is the most common base pick-and-roll defense, matching g1's single most standard placement; issue #37 delegates the choice

## #34: Where does the glossary sit under Tutorial?
- Kind: implementation
- Decision: Main-menu Tutorial opens a submenu (Controls tutorial / Glossary / Back); leaving either returns to that submenu
- Decided by: assumed on 2026-11-15
- Why: DESIGN_DOC M8 says the glossary is under Tutorial; a submenu is the simplest fit and keeps the controls sandbox unchanged

## #34: How do concept tooltips behave in a run (cue levels, duration, seen state, motion)?
- Kind: implementation
- Decision: Tooltips are not cues: they ignore mode cue level and cue toggles and show in Practice and Scrimmage; seen state is per glossary term across plays, marked seen when first shown; each lasts 6s of game time (tooltipSeconds in glossary data), timer stops while paused, dropped on quit; no animation so reduce motion needs nothing; at most 2 concepts per phase
- Decided by: assumed on 2026-11-15
- Why: DESIGN_DOC's Cue covers arrows, rings and prompts only; issue requires non-blocking first-time tooltips; values are data and easy to change

## #34: Which terms does the glossary include?
- Kind: implementation
- Decision: The issue's list plus DESIGN_DOC section 2 terms (21 entries); later modes Live Play and Free Play and the coverage examples drop/hedge/switch are left out
- Decided by: assumed on 2026-11-15
- Why: Live/Free Play are unreachable later modes; drop/hedge/switch are examples inside the Coverage entry, not section 2 terms

## Horns Set (#38): which coverage is the Practice standard?
- Kind: implementation
- Decision: dropBoth (Drop both bigs); symmetric, so either side's screen is Great in Practice. Coverage ids: overplayLeft, overplayRight, dropBoth, cornerHelp. Left = -x from the PG facing the basket; PF is the left big, C the right big. Corner help comes from the corner on the side the PG attacks; the read is the kick to that corner.
- Decided by: assumed on 2026-11-15
- Why: Drop is the standard base defense (g1), matching High Pick-and-Roll's dropBig; issue #38 delegates the choice

## How is Horns' side choice graded when the engine only grades passes, shoot and floater?
- Kind: implementation
- Decision: Add a generic route option to decisions (move: 'move' plus branch: '<phaseId>'), resolved when the run moves from the decision's phase into that phase and graded per coverage like other options; bots walk to the branch's trigger spot. Going into the overplay is graded Bad. Overplay is expressed with the existing sag defender action on shaded spots.
- Decided by: assumed on 2026-11-15
- Why: AC3 requires grading the screen choice and AC4 forbids Horns-specific engine logic; a play-agnostic route option is the smallest generic extension

## Issue 39: the memory test must cover all five plays but only four exist, and node tests have no WebGL. How should it be tested?
- Kind: implementation
- Decision: Loop over every play in the registry (four today, picks up the fifth automatically). Verify in Vitest with a fake renderer that mimics three.js info.memory counting (+1 on first render of a geometry/texture, -1 on its dispose event); after 20 switches through every play both counts equal baseline.
- Decided by: assumed on 2026-11-15
- Why: Decision g11 and src/render/dispose.test.ts set stub-renderer, no-headless-WebGL testing as the convention; looping the registry meets the five-play criterion once the fifth play exists.

## How should AC1 (draw call screenshot) and AC3 (laptop FPS) be evidenced?
- Kind: product
- Decision: Option 1: Ship the ?stats dev overlay plus a Vitest test asserting under 100 render-list draw items for a Horns Scrimmage frame; the PR lists the screenshot and 1080p FPS reading for the user to capture before merge
- Decided by: user on 2026-11-15

## Whether to run another fix-and-review round for the line 258/229 wording or ship the current diff as is
- Kind: implementation
- Decision: Run another round: fix lines 258 and 229, then review again
- Decided by: user on 2026-11-15

## Commit or discard the pending .factory/decisions.md change on main, then requeue #85
- Kind: implementation
- Decision: Option 1: commit the decisions.md change to main, then requeue #85
- Decided by: user on 2026-11-15

## #92: How is recovering after letting the aggressive closeout arrive graded, and does it whistle in Practice?
- Kind: product
- Decision: Option (a): in Scrimmage the recovery is graded Good, so the run continues (Bad would end it as unsuccessful). Practice keeps g3: any below-Great read whistles and resets. A grade for wrong-but-recoverable actions is a separate follow-up.
- Decided by: user on 2026-11-15
- Why: Smallest change that keeps the run going in Scrimmage; a fuller recoverable-grade model is tracked separately

## #33/#40: replace manual screenshot and FPS evidence, and what is the frame-rate target?
- Kind: product
- Decision: Drop every manual capture (grayscale screenshots in #33, the draw-call screenshot and the laptop FPS reading in #40); evidence is automated tests only: per-element non-color tests (#33), a Vitest draw-item count under 100 for a Horns Scrimmage frame, and a per-frame CPU time budget test for sim step plus render prep (#40). Frame-rate target is 30 FPS minimum on a typical laptop, higher is better; this replaces the 60 FPS target in DESIGN_DOC.md:96 and :447. Both issues may auto-merge.
- Decided by: user on 2026-11-15
- Why: No one should have to capture evidence by hand; 60 FPS was never a real requirement

## Drive-and-Kick (#36): which coverage is the Practice standard?
- Kind: implementation
- Decision: helpSteps (help defender steps in); correct read is a chest or bounce kick-out to the right-corner SG. Coverage ids: helpSteps, noHelp, bigAtRim, aggressiveCloseout; one graded decision driveRead, sprint-by graded as shoot. Scrimmage cues: floor arrow on the drive, read prompt without reason.
- Decided by: assumed on 2026-11-17
- Why: Kicking out against help is the play's base lesson and the most standard placement (g1); issue #36 delegates the choice

## Whether to run one more fix-and-review round for the Scrimmage-only wording or open the pull request with the current text
- Kind: process
- Decision: Fix wording, review again: Run another round: an engineer adds the Scrimmage-only wording to lines 229, 258 and 444, then the change is reviewed again before the pull request opens
- Decided by: assumed on 2026-11-17
- Why: A minor process question: the factory took its recommended option ([factory] auto_accept).

## Whether to end the leftover #97 run record so the #95 run can start
- Kind: process
- Decision: Close old record, start work: End the leftover #97 run with harness run end --status aborted and start #95; #97 stays blocked and gets a new run when requeued, its plan files stay on disk
- Decided by: assumed on 2026-11-17
- Why: A minor process question: the factory took its recommended option ([factory] auto_accept).

## After a shot that counts as a mistake, should the game wait under a second for the ball to reach the rim before resetting, instead of resetting instantly, and does the design document wording change in this issue?
- Kind: product
- Decision: Option 1: Wait for shot, update the doc. The whistle and red text stay immediate, the reset waits until the shot lands (about 0.4 to 1 s) for unblocked off-script shots only, and this issue rewords the design document to say the reset comes once a shot in flight lands.
- Decided by: user on 2026-11-17

## #95: How does body contact change a player's speed?
- Kind: implementation
- Decision: Soft contact: a bump slows a player no faster than his braking limit and never speeds the other player up; a set screen holds and the runner slides around it; bodies still never overlap
- Decided by: assumed on 2026-11-17
- Why: Meets the issue's screen-holds criterion and DESIGN_DOC.md:382 physical limits; tuning lives in src/sim/collision.ts and is easy to change

## Decide whether to end the leftover #95 run record so the #97 run can start.
- Kind: process
- Decision: Close old record, start work: End the leftover #95 run with harness run end --status aborted and start #97; #95 stays blocked and gets a new run when requeued, its branch and plan files stay on disk
- Decided by: assumed on 2026-11-17
- Why: A minor process question: the factory took its recommended option ([factory] auto_accept).

## How should a screen hold in the real plays: engine-wide hold, an authored hold phase per play, or leave the plays as they are and narrow the criterion?
- Kind: product
- Decision: Option 1: Screener waits for ballhandler. Engine, all screen plays: after a screen is set the screener stays still until the ballhandler has passed it or a short timeout runs out, then rolls. Changes timing in High Pick-and-Roll, Horns and possibly Dribble Handoff; bot tests and spots are retuned in this issue.
- Decided by: user on 2026-11-17

## Decide whether passing checks on the branch are enough before merge, with the main branch run confirmed after the merge.
- Kind: process
- Decision: Check main after the merge: Accept this branch's passing gates as pre-merge evidence, and have the supervisor confirm the CI and deploy run on main after the merge before closing #41
- Decided by: assumed on 2026-11-17
- Why: A minor process question: the factory took its recommended option ([factory] auto_accept).

## What counts as enough proof that the live site works for the v1 release check (AC3 of #41)?
- Kind: product
- Decision: Option 1: Automated checks, gap noted in PR. Accept the HTTP 200 check plus the headless release smoke test as AC3 evidence and state the real-browser gap in the PR.
- Decided by: user on 2026-11-17
- Why: The user opened the live site themselves and confirmed that both a Practice and a Scrimmage run work.
