# Court Vision

> A cartoon basketball game that teaches people who have never played basketball how to move, space the floor, and make the right read, one position and one play at a time.

This document is the **design spec and source of truth** for Court Vision (the [README](../README.md) is the short overview). It is written to be read by an automated software factory that will break it into issues and build the game. It describes the *vision and behavior* in detail and prescribes implementation only where a decision is important. **Where this document is silent, use your best judgment in service of the vision and the design pillars below, and record significant decisions in `.factory/decisions.md`.**

---

## 1. Vision

Most basketball games reward execution: timing a shot, crossing up a defender, out-skilling the opponent. Court Vision rewards **understanding**. The player is locked to a single position (a role on the court) and runs real basketball plays against live-looking defenses. The goal is not to be athletic or accurate with a button. The goal is to learn **where to be, when to move, who to pass to, and when to shoot**, and to see why.

A person who has never watched a basketball game should be able to open Court Vision in a browser, learn what a "pick and roll" is, run it a few times with generous guidance, then run it against defenders who react, and walk away actually understanding how the play works and how to read the defense.

### Who it's for

- Total beginners to basketball (the primary audience).
- Casual fans who want to understand what they're watching.
- New or young players learning spacing, cutting and reading fundamentals.

### Design pillars

1. **Reads over reflexes.** The result of an action is decided by the *situation* (spacing, defender position, matchup), not by how well the player executes buttons. Shot-making skill is de-emphasized. Getting a *good look* is what matters.
2. **Teach, don't test.** Guidance is generous and layered. Mistakes are cheap (instant reset) and always explainable. Players are never stuck or punished harshly.
3. **Every tool has a purpose.** The player has a full bag of moves, but each is useful in specific situations (a bounce pass through traffic, a lob over a defender, a floater over a big, a sprint past a closing defender). No move lets the player simply beat a defender 1-on-1 without a reason.
4. **Readable at a glance.** An elevated, tactical camera and simple, chunky, cartoon characters keep spacing and positioning visible and unintimidating.
5. **Data-driven and extensible.** Plays, roles, defensive coverages, and scenarios are data. Adding a new play or a new position should never require changing engine code.
6. **Zero friction.** It's a static web page. Open a link and play. No install, no account, no server.

---

## 2. Terminology

Use these terms consistently in code, UI, issues and docs.

| Term | Meaning |
|---|---|
| **Role / Position** | One of the five basketball positions: PG (point guard, 1), SG (shooting guard, 2), SF (small forward, 3), PF (power forward, 4), C (center, 5). The player controls one role at a time. |
| **Play** | A named, authored offensive concept (e.g. "High Pick-and-Roll") that defines the movements of all five offensive players and the decision points for the playable role. |
| **Possession / Run** | One attempt at a play, from the reset to the half-court starting set until it ends in a shot, a turnover, or a reset. |
| **Coverage** | How the defense is scripted to respond to a play (e.g. drop, hedge, switch). A play has multiple coverages, one chosen per run, so the correct read changes. |
| **Decision point** | A moment in a play where the player must choose (e.g. "defender went under the screen: pull up or pass?"). Decision points are graded. |
| **Look** | The quality of a shot opportunity (how open, how close, how well-positioned). Rated Great / Good / Bad. |
| **Cue** | A guidance element shown to the player (floor arrow, target ring, "do this now" prompt). |
| **Practice** | Mode: one play, **no defenders** (cones mark where defenders would be), heavy guidance. |
| **Scrimmage** | Mode: one play, **5-on-5 with live defenders**, Reduced cues, slightly slower pace, reads matter. |
| **Live Play** *(later)* | Mode: same per-play structure as Scrimmage, but **no cues**. The player reads everything. Still a practice mode. |
| **Free Play** *(later)* | Mode: an open, flowing game simulation. The player picks a position and difficulty, calls plays in real time, and plays offense **and** defense. |
| **Mastery** | Per play per mode, a count of successful runs. At a threshold (default 10) the play is marked "Mastered". |

---

## 3. Scope and Roadmap

### v1 (build this now)

- **Role supported: PG only.** The architecture must support adding the other four roles without engine changes.
- **Modes: Practice and Scrimmage.**
- **A separate Tutorial section** (controls and basketball concepts).
- **Five PG plays** (section 9), ordered easiest to hardest.
- **Play-select menu** with a blurb and animated preview for each play.
- **Progress tracking** (per-play successful run counts and Mastery), saved in the browser.
- **Settings:** controls/rebinding, volume/mute, cue visibility, and similar basics.
- **Audio:** light sound effects and an optional music loop.
- **Deployment** as a static site via GitHub Actions.

### Later (design for it, don't build it yet)

1. **Live Play**: the no-cue version of the per-play mode. It should be achievable mostly by configuration (cue level set to none), not new systems.
2. **Free Play**: open game flow, 2K-style real-time play-calling wheel, transition after turnovers and made/missed shots, **full defensive control** for the player, selectable difficulty (Rookie / Pro / All-Star), selectable session length (first to a score target, or a number of possessions/timer). Starts with PG.
3. **More roles** (SG, SF, PF, C) with their own plays and movement schemes, plus off-ball plays for each role, added gradually.
4. **Defensive mode**: play the other side of the ball and see how offensive plays look from the defender's seat.
5. **Full court** and transition.
6. **Personalization** of team colors and jersey numbers.
7. **Rewind-to-decision-point** retry and richer mistake explanations.
8. **Fouls and free throws**, and other rules.
9. **Mobile/touch** controls.

### Explicit non-goals for v1

No multiplayer, accounts, leaderboards or backend of any kind. No full-court play. No fouls. No character creator. No licensed or real-player content. No voice acting.

---

## 4. Technical Foundations

Implementation is mostly the factory's call. These decisions are fixed because they shape everything else.

- **Language/tooling:** TypeScript, Vite, three.js, Vitest. ESLint and Prettier. Strict TypeScript.
- **Rendering:** plain three.js. Default to the WebGL renderer. WebGPU is optional and out of scope for v1. **Pin the three.js version** in `package.json`.
- **UI:** HTML/CSS overlay for menus, HUD, cues-as-text and prompts. No React or UI framework is required. World-space cues (floor arrows, target rings, cones) are drawn in three.js.
- **Physics:** no physics engine. Movement and the ball are custom and kinematic. Basketball outcomes are rule- and situation-based (see section 7), not simulated by collision.
- **No backend.** The game is a purely static site.
- **Persistence:** `localStorage` with a versioned schema and safe fallback if data is missing or corrupt.
- **Platform:** desktop browsers (Chrome, Firefox, Safari, Edge, current versions). Keyboard + mouse first, gamepad supported. Design the UI so layout is responsive-friendly for a future mobile version, but do not build touch controls in v1.
- **Performance target:** 60 FPS on a typical integrated-GPU laptop at 1080p. Keep draw calls low (aim for under ~100 per frame). Use instancing/merged geometry where practical. Dispose geometries, materials and textures properly. Handle window resize and tab-visibility (pause when hidden).

### Architecture requirements

Keep these layers separate. The simulation must be runnable **without three.js or a browser**, so it can be tested headlessly.

1. **Simulation core** (pure TypeScript, no three.js imports): fixed-timestep game state, players, ball, movement, passing, shot resolution, look-quality, grading, rules.
2. **Content/data layer:** plays, roles, archetypes, coverages, scenarios, tutorial content, all as validated data (JSON or typed TS objects with schema validation), loaded at startup. Invalid data must fail loudly with a helpful error.
3. **AI layer:** teammate and defender behavior driven by the data layer.
4. **Input layer:** abstract *actions* (pass, sprint, shoot...) mapped from physical inputs. Fully rebindable.
5. **Rendering layer:** reads simulation state and draws it. Smooth interpolation between fixed simulation steps.
6. **UI layer:** menus, HUD, prompts, tutorial, settings.
7. **Audio layer:** event-driven sound effects and music.
8. **App/state layer:** screen flow (menu, tutorial, mode select, in-run, settings) as an explicit state machine.

**Determinism:** the simulation uses a **seeded RNG** and a **fixed timestep**, so the same seed plus the same inputs gives the same result. This makes tests and bug reproduction practical.

### Deployment

- Build with `vite build`. Deploy the `dist/` folder to **GitHub Pages** using a GitHub Actions workflow on pushes to `main`.
- Set the Vite `base` option to match the repository path (`/court-vision/`); a wrong base breaks asset loading on Pages.
- The CI workflow runs: typecheck, lint, unit tests, build (and deploys on `main`).
- The project must remain portable to other static hosts (Cloudflare Pages, Netlify) by changing only the `base` setting.

---

## 5. The Court, Camera and Look

### Court and camera

- A **half court**. Each run starts at the same half-court setup for that play (the ball with the PG near the top of the key, the other four players in their starting spots).
- An **elevated, angled "tactical/broadcast" camera** that keeps all ten players and the basket visible. It is essentially fixed (small smoothing/pan limits only). Do not use a behind-the-player camera: it hides spacing, which is the thing being taught.
- A simple, friendly gym environment: floor markings (key, three-point line, free-throw circle, etc.) clearly readable, a hoop and backboard, and a lightweight backdrop. Floor lines should be clean and bold, because cues are drawn on top of them.

### Visual style

- **Chunky low-poly cartoon**: oversized heads, simple limbs, bold flat colors, **toon shading with outlines**.
- **Characters are built procedurally from primitives** and animated procedurally (no external art/animation assets are required). Simple, expressive animations: idle, run, sprint, dribble, pass, catch, shoot, layup/floater, screen stance, celebration, disappointment.
- **Body types differ visibly by role** (a PG is smaller and quicker-looking than a C). This reinforces the mismatch teaching: players should be able to *see* why a big is slow on the perimeter.
- Offense wears one team color, defense another. Each player shows a jersey number. The human-controlled player has an unmistakable marker (e.g. a ring/arrow overhead).
- Defenders in Practice appear as **cones** (colored in the defense's color), possibly with a tiny number/role label.
- Design for **future personalization**: team colors and jersey numbers should be data-driven, not hard-coded, even though v1 ships a fixed cast.

### Cues (what the player sees as help)

Cues are layered and individually switchable in code (see the cue levels below):

- **Floor path arrows** showing where the player should move.
- **Target highlight**: a pulsing ring on the teammate to pass to, or a marked spot on the floor to move to or shoot from.
- **"Do this now" prompt**: short text or icon (e.g. "Pass to the cutter!", "Sprint!") with a brief reason when helpful.
- **Cue levels** are configuration: `Full` (Practice), `Reduced` (Scrimmage), `None` (Live Play, later). Scrimmage shows movement guidance but is subtler about *decisions* (it may hint at the right read without making it obvious). Cue level must be a data/config property of a mode so Live Play can be added by configuration.
- Never rely on color alone: pair color with shape, icon or text for accessibility.

---

## 6. The Player's Move Set (PG in v1)

The player controls one character. The move set is deliberately **strategic, not skill-based**: each tool has a situation where it's the right one, and none is a "beat your man with finesse" button.

### Actions

| Category | Action | When it's the right choice (teach this) |
|---|---|---|
| **Movement** | Walk/jog (analog direction) | Positioning, spacing, following the play |
| | **Sprint** (stamina-limited) | Blowing past a defender who closed out too hard or has been beaten; getting to a spot quickly |
| | Pivot / ball protect | Keeping the ball safe while looking for a pass |
| **Passing** | **Chest pass** | Default pass when the lane is clear |
| | **Bounce pass** | Getting the ball through a defender's arms or tight traffic, especially to a cutter or roller |
| | **Lob** | Over a defender to a big rolling to the rim or a cutter behind the defense |
| | Hand-off | Giving the ball to a teammate who is cutting/running by |
| **Scoring** | **Layup / finish** | At the rim with an open lane |
| | **Floater** | Over a taller/rim-protecting defender when driving would meet resistance |
| | **Catch-and-shoot** | Open teammate or self after receiving the ball set |
| | **Pull-up jumper** (mid-range or three) | The defender sags or goes under a screen, leaving space |
| **Off-ball / coordination** | Call for the ball / call for a screen | Communicating with AI teammates (e.g. ask the big for a ball screen) |
| | Set / use a screen (role-dependent) | Creating advantages for teammates |

Context-aware shot selection: a single *shoot* action chooses the right shot type from position and situation (layup at the rim, jumper from mid-range, three from beyond the arc, pull-up if dribbling, catch-and-shoot if just received). **The floater is its own action** because choosing it over a layup is itself a read.

### Default controls (all rebindable; sensible gamepad mapping required)

| Action | Keyboard / mouse default | Notes |
|---|---|---|
| Move | WASD (or arrows) | Analog on gamepad |
| Sprint | Shift (hold) | Drains a stamina meter; refills when not sprinting |
| Pass target | **Number keys 1-4** select the teammate, OR **aim with the mouse cursor** (direction toward the target) | Both supported. A setting chooses `Numbered`, `Aim`, or `Both`. |
| Chest pass | Left click | |
| Bounce pass | Right click | |
| Lob | Double click (timing configurable) | |
| Shoot (context) | Space | |
| Floater | A dedicated key | |
| Call for screen / hand-off | A dedicated key | |
| Pivot / protect | A dedicated key | |
| Pause | Esc | |

**Feel:** aim for a "2K-lite" feel: movement has weight and momentum, but is forgiving. **The input scheme must be fully modular**: actions are abstract, bindings are data, and players can remap everything in Settings and have it persist. Pass targeting mode, double-click timing, and aim sensitivity should be adjustable.

---

## 7. How Outcomes Are Decided

All outcomes are **situation-driven**, using each player's **archetype attributes**, with small bounded randomness (seeded) only to avoid feeling scripted. The player cannot succeed by mere execution, and cannot be blocked by a lack of it.

### Archetype attributes

Each player has attributes (names are suggestions): **speed, acceleration, size/reach, strength, shooting (by zone), passing, ball security, defensive awareness** (AI). Each role has a default archetype. Tuning values live in one data/config file so they're easy to adjust.

### Principles

- **Speed mismatches matter.** A guard blowing past a slow big on the perimeter works. A guard trying to sprint past a same-speed defender who is set does not.
- **Aggressive closeouts can be punished.** A defender who rushes too hard at the player can be beaten off the dribble with a sprint, or with a pass to the open teammate they left.
- **Size matters at the rim.** A taller defender at the rim contests layups, which is why a floater is sometimes the right choice.
- **Passes can be intercepted** if the lane is crowded or the pass type is wrong for the situation (e.g. a chest pass through a defender's arms vs. a bounce pass around them; a lob to a covered roller).
- **Spacing matters.** Teammates who are too close together or standing in the player's lane reduce the quality of the look and create help-defense options for the defense.
- **Bad decisions are easy to explain.** Every negative outcome must map to a clear reason that could be shown as text (e.g. "Contested shot", "Passed into a crowded lane", "Missed the open teammate").

### Look quality (the heart of grading)

A **look** is scored from the situation when a shot or scoring action is taken, using factors such as: distance to the nearest defender and whether that defender is closing, shot distance and zone vs. the shooter's range, whether the shooter received the ball set or off-balance, whether an advantage was created (a screen, a mismatch, a beaten defender, a defender drawn away), and the rim contest from size.

Looks are rated **Great / Good / Bad**.

- **Shot results use look quality to set the odds.** Great/Good looks go in at high rates. Bad looks mostly miss. There is **no player skill input** (no timing meter).
- The shooter's attribute for that zone shifts the odds. This is what allows "take the shot that fits the shooter" to be a lesson.

### Decision grading

Each **decision point** in a play is graded when the player resolves it:

- **Great**: the best read for this coverage.
- **Good**: an acceptable read that still produces a good look.
- **Bad**: a mistake, such as passing up an open teammate for a contested shot, forcing a pass into traffic, or settling for a bad look.

Grades drive (a) the on-screen mistake text, (b) the end-of-run result banner, and (c) whether a run counts as a success.

---

## 8. Game Modes (v1)

### 8.1 Practice

- **Purpose:** go through the motions of a play with no pressure.
- **Setup:** the player's five-person offense on the half court. **No defenders.** Cones mark where defenders would be. Cones follow the play's script (they may reposition at each phase to show how defenders would slide) but **never contest, steal, or block**.
- **Teammates:** AI teammates run their part of the play. The play advances in **phases, triggered by events** (player reached a spot, pass completed, screen set), not just by a timer, so a slow beginner never gets left behind.
- **Cues:** `Full`.
- **Clock:** none.
- **Run ends:** after the player completes the play and takes the final shot (made or missed) or is graded on the final decision. The run counts as a **success** if the player followed the play and generated a Good or Great look. The result banner shows briefly, then the game resets for another attempt.
- **Mistakes:** a mistake (e.g. a wrong pass or turnover) gives the "bad" whistle sound, an optional short red text, then an **instant reset** to the half-court starting set.

### 8.2 Scrimmage

- **Purpose:** the same play against **live defenders** so reading becomes important.
- **Setup:** full **5-on-5**. Defenders follow a **coverage** chosen at random (seeded) for each run from the play's coverage list, so the best read changes between attempts.
- **Pace:** slightly **slower game speed** than a real game (a configurable speed multiplier, default around 0.85x).
- **Cues:** `Reduced`. Movement cues remain, and decision cues are subtler (e.g. a hint after a short delay, or a highlight on the open teammate only once the opening exists).
- **Clock:** a generous shot clock (default 24 seconds, configurable). A violation is a mistake.
- **Mistakes:** turnovers, bad looks, and shot-clock violations give the "bad" whistle, optional short red text, and an **instant reset** to the half-court start. Mistakes are meaningful but never harsh.
- **Run ends/success:** same rule as Practice, with the extra requirement that the player made a read appropriate to the coverage faced.

### 8.3 Mistake feedback (both modes)

- **Required:** a clear "bad" whistle sound effect the moment a mistake occurs, then instant reset. No modal dialog, no explanation screen.
- **Should have (ship in v1 if feasible, otherwise v1.1):** a short, simple red text pop-up right after the mistake naming the problem, such as "Contested shot", "Turnover", "Shot clock", or "Missed open teammate".
- **Positive feedback:** on a successful run, a brief green result banner (e.g. "Great look: open shooter found").

### 8.4 Progress and Mastery

- Each play tracks **attempts** and **successful runs**, **separately per mode** (Practice and Scrimmage).
- At **10 successful runs** (configurable) a play is marked **Mastered** in that mode, with a clear badge in the play-select menu.
- **No stars, no scoring system, and no lock gating** in v1: every play and mode is available from the start. The menu may *suggest* trying Scrimmage after a few Practice successes, but never blocks it.
- All progress saves to `localStorage`. Provide a "reset progress" option in Settings.

---

## 9. Plays (v1, PG)

Each play is defined as **data** (section 10). Every play must include, for the PG: setup positions, the phases for all five players, the PG's decision points, at least **two coverages** (listed below) that each change the best read, a short plain-language blurb, and an animated preview.

The descriptions below are the intent. Refine specifics for correct basketball and good gameplay, but **preserve the concept each play teaches and ensure every coverage requires a different best read.**

Positions: 1 = PG (the player), 2 = SG, 3 = SF, 4 = PF, 5 = C.

### 1. Give-and-Go  *(easiest)*

- **Teaches:** don't stand still after you pass. Pass, then cut to the basket.
- **Setup:** PG at the top with the ball. SG on the wing. Others spaced on the perimeter.
- **Play:** PG passes to the wing and **cuts hard toward the rim**. The wing returns the pass to the cutting PG for a layup.
- **Coverages:**
  - *Ball-watching defender:* the PG's defender watches the ball. The cut is open, so the correct read is to complete the cut and receive the return pass for a layup.
  - *Help shows on the cut:* a help defender steps into the lane. The correct read is to stop the cut and kick the ball to the open perimeter player (or finish with a floater if the lane allows).
- **Blurb:** "After you pass, keep moving. Cut to the rim and your teammate can give it right back."

### 2. Drive-and-Kick (5-Out Spacing)

- **Teaches:** spacing, and that driving makes defenders move, which creates open shooters.
- **Setup:** four teammates spread around the three-point line (including both corners). Lane open.
- **Play:** PG drives toward the rim.
- **Coverages:**
  - *Help defender steps in:* a defender leaves a shooter to stop the drive. Correct read: **kick out** to the now-open shooter (chest or bounce pass).
  - *No help (the big sags):* Correct read: finish at the rim.
  - *Big stays near the rim:* Correct read: a **floater** over the big.
  - *Defender closes out too aggressively:* Correct read: **sprint** by the overplaying defender.
- **Blurb:** "Drive at the rim and defenders have to react. Find who they leave open."

### 3. Dribble Handoff (DHO)

- **Teaches:** using a teammate as a moving screen, and reading how the defender plays it.
- **Setup:** the C comes toward the top. PG with the ball nearby.
- **Play:** the C holds the ball as the PG cuts by and takes the handoff, using the C's body as a screen.
- **Coverages:**
  - *Defender chases over the top:* Correct read: go **downhill** toward the rim (sprint if there's space).
  - *Defender goes under:* Correct read: **pull up** for a jumper.
  - *Defenders switch:* Correct read: attack the mismatch (the PG vs. the big, speed advantage) or pass to the screener if it's a mismatch in the other direction.
- **Blurb:** "Take the ball from a big and use their body to shake your defender. Watch how the defender goes around it."

### 4. High Pick-and-Roll

- **Teaches:** the pick-and-roll read, the most important two-man game in basketball.
- **Setup:** PG at the top with the ball, the C sets a **ball screen**, the wings and corners are spaced.
- **Play:** PG uses the screen and reads the screener's defender.
- **Coverages:**
  - *Drop (big sags back):* Correct read: **pull-up** jumper or floater.
  - *Hedge (big steps out then recovers):* Correct read: **bounce pass** or lob to the rolling C, or split the defenders if the gap is open.
  - *Switch:* Correct read: attack the mismatch if the PG's defender is a big (sprint, space, speed), or **lob/post pass** to the C if a small defender now has the C.
  - *Help from the corner on the roll:* Correct read: **kick out** to the corner.
- **Blurb:** "A big sets a screen on your defender. What the big's defender does decides what you do."

### 5. Horns Set  *(hardest)*

- **Teaches:** reading two options at once and picking a side, plus using two bigs.
- **Setup:** two bigs (4 and 5) at both elbows, the SG and SF in the corners, the PG at the top with the ball.
- **Play:** the PG chooses a side to use a **ball screen** from one big, while the other big spaces or slides. The PG reads which side the defense is protecting.
- **Coverages:**
  - *Defense overplays the left side:* Correct read: go right.
  - *Defense overplays the right side:* Correct read: go left.
  - *Defense drops both bigs:* Correct read: pull up, or use the open big at the elbow.
  - *Corner defender helps:* Correct read: kick to that corner.
- **Blurb:** "Two bigs, two options. Pick the side where the defense is weaker."

---

## 10. The Play and Scenario Data System

This is the most important extensibility requirement. **Adding a new play, role, or scenario must be a data change plus, at most, small additions to a shared library of reusable behaviors.**

### Play definition (conceptual)

A **play** contains:

- **Metadata:** id, name, difficulty order, plain-language blurb, and the concept it teaches.
- **Setup:** starting positions and ball holder for all five offensive slots.
- **Role tracks:** for **each of the five offensive slots**, a script of phases (move to a spot, set a screen, cut, receive, space the floor, etc.). Any slot can be human-controlled or AI-controlled. v1 ships only PG as human-playable, but every slot has a track so other roles can be enabled by data.
- **Phase triggers:** conditions that advance the play (player reached a spot, pass completed, screen set, time elapsed, defense reaction occurred).
- **Decision points:** for each playable role, where a choice occurs, what the options are, and how each is graded **per coverage**.
- **Cue content:** which cues appear at each phase for each cue level.
- **Coverages:** the defensive scripts (where the five defenders go and how they react at each phase), including the cone placements used by Practice.
- **Playable roles:** which slots can be controlled by the human (v1: PG only).
- **Preview:** the play viewer replays the play using a "perfect" bot (see section 13). No hand-made animation assets.

### Scenarios

A **scenario** is the generalized concept of a play run: starting positions, ball location, human role, opponent setup, and goals. **Plays are one type of scenario.** v1 only ships play-scenarios, but the data model and loader must be designed so that other situations (a 2-on-1 break, an out-of-timeout play, an endgame situation) can be added later without redesign.

### Roles

Roles are data: name, number, body type, default archetype, available moves, and (later) per-role movement schemes. Adding SG/SF/PF/C should be mostly new data and new plays.

### Validation

All content is validated against a schema at load time. A CI test loads every play and verifies it's well-formed (all five tracks, valid positions inside the court, reachable decision points, at least two coverages).

---

## 11. AI Behavior

### Teammates (offense)

- Execute their role track for the selected play, advancing by **event triggers**.
- React sensibly to the human player's actions: pass accuracy, catching the ball, adjusting to a different but valid decision (e.g. shifting to space correctly after a kick-out).
- Maintain spacing and avoid standing in the player's lane.
- When the human deviates from the play (e.g. a bad pass), AI behaves plausibly and the mistake rules still apply.

### Defenders (Scrimmage)

- Follow the chosen **coverage** script, reacting to the ball, the player's movement and screens.
- Defensive awareness and speed come from archetype attributes.
- Defenders must be **beatable and exploitable in the intended ways** (e.g. over-aggressive closeouts can be beaten; a sagging big gives space) and **not exceed their physical limits**.
- No behavior that would feel unfair or random. The reason for a defensive result should be understandable.

### Cones (Practice)

- Non-interactive markers positioned per the coverage script, repositioning between phases.

---

## 12. Screens, Menus and Tutorial

### Screen flow

Title / Main Menu, then **Tutorial**, **Practice**, **Scrimmage**, **Settings**, and **Progress**, followed by Play Select, then the In-Run screen with a pause menu.

### Play-select menu

- A list or grid of the five plays, ordered by difficulty.
- For each play: name, **a short plain-language blurb**, the **animated preview** (the play running automatically in a small viewport using the perfect bot, so no separate asset is needed), the mode(s) available, attempts, successes, and a **Mastered** badge.

### Tutorial (a separate section from the plays)

- A short **interactive controls tutorial**: moving, sprinting, passing (all types), shooting, calling for a screen.
- A **basketball concepts glossary** in plain language: positions, spacing, screen, cut, pick-and-roll, handoff, help defense, closeout, mismatch, floater, lob, bounce pass, etc.
- **In-context tooltips** the first time a concept appears during a play.
- Assume the player has **never watched basketball**: no jargon without a plain explanation.

### HUD

- Mode label, play name, a short objective line, stamina meter (for sprint), shot clock (Scrimmage), and the cue layer.
- Result banner at the end of a run. Brief red text on mistakes (optional; may slip to v1.1).
- Keep it minimal and uncluttered: the court is the focus.

### Settings

- Control rebinding (keyboard/mouse and gamepad), pass targeting mode, double-click timing, aim sensitivity.
- Volume, music on/off, SFX on/off.
- Cue visibility options (cannot be turned off in Practice's Full level unless the player explicitly disables it).
- Reset progress.
- Accessibility basics: do not rely on color alone, readable text sizes, an option to reduce motion/camera effects.

---

## 13. Quality, Testing and Acceptance

The factory should treat these as part of the product.

### Testing strategy

- **Unit tests (Vitest)** for the simulation core: movement, passing and interception, look-quality, grading, shot clock, mastery counting, input mapping, persistence, and data validation.
- **Play bots:** build two simple bots for the simulation:
  - A **correct-read bot** that plays each play correctly for each coverage. For **every play × coverage**, it must produce a successful run (a Good/Great look and no mistake).
  - A **wrong-read bot** that makes the typical mistakes. For **every play × coverage**, it must trigger the expected mistake or a Bad grade.
  These two tests act as the backbone of correctness for the content and AI. The correct-read bot also powers the **animated play previews**.
- **Determinism test:** same seed plus the same inputs gives an identical result.
- **Content validation test** over all plays.
- **Smoke test** that the app boots, loads content, and reaches an in-run state (headless where possible).

### Definition of done for v1

- All five plays are playable in **Practice** and **Scrimmage** as the PG, with all listed coverages.
- The tutorial and play-select blurbs and previews work for all five plays.
- Mistakes trigger the whistle and instant reset. Successful runs are counted. Mastery is displayed. Progress persists.
- Controls are fully rebindable and gamepad works.
- Audio works with volume/mute.
- 60 FPS target met on a typical laptop. No console errors. No resource leaks when switching plays and modes repeatedly.
- CI is green and the game deploys to GitHub Pages and loads correctly at the repository path.
- The README documents how to run, test and build. `docs/adding-a-play.md` documents how to add a new play (and, later, a new role).

---

## 14. Audio

- **Sound effects:** dribble, pass (chest/bounce/lob variants), catch, shot release, swish, rim hit, screen contact, sprint footsteps, UI clicks, success chime, and the **"bad" mistake whistle** (required).
- **Music:** a light, optional looping track with an on/off setting and volume control.
- **Sourcing:** royalty-free (CC0 or equivalent) files, or procedurally generated with the Web Audio API. Record the licenses of any assets in `docs/assets.md`. Respect browser autoplay rules (start audio after the first user interaction).

---

## 15. Suggested Build Order (milestones)

Issues should roughly follow this order, each delivering something runnable.

1. **M0, Scaffold:** TypeScript + Vite + three.js + Vitest + lint/format, CI, GitHub Pages deploy of a "hello court".
2. **M1, Court and characters:** half court, toon-shaded procedural characters with role body types, the tactical camera, basic animations.
3. **M2, Simulation core:** fixed-timestep loop, seeded RNG, players, ball, movement and sprint/stamina, passing (chest/bounce/lob) with interception, shot resolution with look-quality and odds.
4. **M3, Input:** the action abstraction, keyboard/mouse and gamepad, number-key and aim-based targeting, rebinding.
5. **M4, Play system:** data schema and validation, phase/trigger engine, role tracks, coverage scripts, scenario loader.
6. **M5, Vertical slice:** **Give-and-Go in Practice** end to end (cues, cones, grading, whistle, instant reset, success counting).
7. **M6, Scrimmage:** live defenders, coverage selection, reduced cues, slower pace, shot clock. Give-and-Go in Scrimmage.
8. **M7, Remaining plays:** Drive-and-Kick, Dribble Handoff, High Pick-and-Roll, Horns, with all coverages, plus the correct-read and wrong-read bot tests.
9. **M8, Menus and meta:** main menu, play select with blurbs and bot-driven previews, tutorial and glossary, settings, progress and mastery with persistence.
10. **M9, Audio and polish:** SFX, music, result banners, accessibility, performance pass.
11. **M10, Release readiness:** documentation (`README.md`, `docs/adding-a-play.md`, `.factory/decisions.md`, `docs/assets.md`), final deploy checks.

---

## 16. Where the Factory Has Latitude

The factory should decide, and document in `.factory/decisions.md`:

- Exact attribute values, tuning constants and thresholds (keep them in a single config).
- Exact animation and visual details within the style guidelines.
- Exact UI layout and wording, within the minimal-HUD and plain-language principles.
- Internal data formats and the specific phase/trigger vocabulary.
- Libraries for schema validation, audio, and small utilities (prefer few dependencies).

The factory should **not** change: the terminology, the v1 scope, the move philosophy (situation over execution), the half-court/tactical-camera choice, the layered architecture with a headless simulation, or the data-driven play system.

---

## 17. Future Vision (so v1 stays compatible)

- **Live Play:** configuration of the existing per-play system with cue level `None`. Likely adds a score of play quality and keeps the mastery counter.
- **Free Play:** a continuous game using the same simulation, adding real-time play-calling from a wheel (call, break off, and recall plays during a possession), transition after turnovers and made/missed shots, **full defensive controls** (steal, contest, help, switch), Rookie/Pro/All-Star difficulty, and selectable session length (first to a score target, a number of possessions, or a timer).
- **Defensive mode:** the player is a defender watching and responding to offensive plays.
- **More roles and off-ball plays:** each new role is data (role, archetype, move set, plays, cue content).
- **Full court and transition play.**
- **Rewind-to-decision-point** replay of mistakes.
- **Personalization** of colors and jerseys.
- **Touch/mobile controls.**

---

*Court Vision: learn to read the floor.*