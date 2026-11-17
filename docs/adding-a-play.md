# Adding a play

Plays are data, not code. Each play is one file, `src/content/data/plays/<playId>.ts`, that exports a plain object. The hand-written validators in `src/content/validate.ts` and `src/content/plays.ts` check it fail-fast when the content loads (there is no schema library). Every error names the field path rooted at the play id, for example `giveAndGo.tracks.SF`, so a mistake points at the exact field.

## Steps to add a play

1. Create `src/content/data/plays/<playId>.ts`. The file name equals the camelCase play id. Export a `<PLAY_ID>_FILE` string and a `<PLAY_ID>_DATA` object, as `src/content/data/plays/giveAndGo.ts` does.
2. Register it in `BUNDLED_PLAY_SOURCES` in `src/content/playbook.ts`. `src/content/playbook.test.ts` fails if a play file is not registered.
3. Add bot tests (see [Bot tests](#bot-tests)).
4. Run the checks: `npm run test`, `npm run typecheck`, `npm run lint` and `npm run format:check`.

## Worked example

The example below is a small play, Elbow Drive. It is a real file at `tests/docs/fixtures/elbowDrive.ts`, and `tests/docs/addingAPlay.test.ts` loads it through the real validators and checks that this page shows it verbatim. If the schema changes, that test fails until the example and this page are updated. The play is not registered in the game.

```ts
// Elbow Drive (worked example for docs/adding-a-play.md): the PG drives to the elbow, then reads
// the help and either pulls up or dishes to the big.
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.
// `concepts` lists glossary term ids (src/content/data/glossary.ts) introduced in a phase.

export const ELBOW_DRIVE_FILE = 'src/content/data/plays/elbowDrive.ts';

export const ELBOW_DRIVE_DATA = {
  kind: 'play',
  id: 'elbowDrive',
  name: 'Elbow Drive',
  difficulty: 2,
  blurb: 'Drive to the elbow, then read the help: pull up or dish to the big.',
  concept: 'Attack the elbow, then let the defense tell you what to do.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: { x: 0, z: 2.5 },
      SG: { x: 5.5, z: -1 },
      SF: { x: -5.5, z: -1 },
      PF: { x: 7, z: -6 },
      C: { x: -4, z: -4 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'attack',
      concepts: ['spacing'],
      transitions: [
        { to: 'read', trigger: { kind: 'reachedSpot', role: 'PG', spot: { x: -1.5, z: -2 } } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: { x: -1.5, z: -2 } },
          {
            kind: 'prompt',
            text: 'Drive to the elbow',
            reason: 'Get into the lane so the defense has to react',
          },
        ],
        reduced: [{ kind: 'floorArrow', to: { x: -1.5, z: -2 } }],
        none: [],
      },
    },
    {
      id: 'read',
      concepts: ['helpDefense', 'mismatch'],
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read the big',
            reason: 'Pull up if you are guarded one-on-one; dish to the big if help comes',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read the big' }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'attack', action: 'drive', spot: { x: -1.5, z: -2 } },
      { phase: 'read', action: 'hold', spot: { x: -1.5, z: -2 } },
    ],
    SG: [{ phase: 'attack', action: 'space', spot: { x: 5.5, z: -1 } }],
    SF: [{ phase: 'attack', action: 'space', spot: { x: -5.5, z: -1 } }],
    PF: [{ phase: 'attack', action: 'space', spot: { x: 7, z: -6 } }],
    C: [{ phase: 'attack', action: 'space', spot: { x: -4, z: -4 } }],
  },
  coverages: [
    {
      id: 'soloDefense',
      name: 'Everyone stays home',
      practiceStandard: true,
      script: [
        {
          phase: 'attack',
          defenders: {
            PG: { spot: { x: 0, z: 1.5 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -3.5, z: -5 }, action: 'guard' },
          },
        },
        {
          phase: 'read',
          defenders: {
            PG: { spot: { x: -1.5, z: -1 }, action: 'sag' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -3.5, z: -5 }, action: 'guard' },
          },
        },
      ],
    },
    {
      id: 'bigSwitches',
      name: 'The big switches onto the ball',
      practiceStandard: false,
      script: [
        {
          phase: 'attack',
          defenders: {
            PG: { spot: { x: 0, z: 1.5 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -3.5, z: -5 }, action: 'guard' },
          },
        },
        {
          phase: 'read',
          defenders: {
            PG: { spot: { x: -1.5, z: -1 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -2, z: -3 }, action: 'switch', guards: 'PG' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'driveToElbow',
      role: 'PG',
      phase: 'attack',
      options: [
        {
          id: 'driveIn',
          move: 'move',
          branch: 'read',
          grades: { soloDefense: 'great', bigSwitches: 'great' },
        },
      ],
    },
    {
      id: 'elbowRead',
      role: 'PG',
      phase: 'read',
      options: [
        { id: 'pullUp', move: 'shoot', grades: { soloDefense: 'great', bigSwitches: 'bad' } },
        {
          id: 'dishToBig',
          move: 'bouncePass',
          target: 'C',
          grades: { soloDefense: 'good', bigSwitches: 'great' },
        },
      ],
    },
  ],
};
```

Walk-through:

- The header says what the play teaches. `playableRoles` lists the roles the user can control; each needs a decision.
- `attack` is `phases[0]`, so it is the start. Its one transition fires when the PG reaches the elbow spot. `read` has no transitions, so it is terminal.
- Each phase has cues for three levels (`full`, `reduced`, `none`) and up to two glossary `concepts`.
- Every role has a track. The PG drives to the elbow and then holds. The others space the floor.
- There are two coverages. `soloDefense` is the Practice standard. In `bigSwitches` the C's defender uses a `switch` step with `guards: 'PG'`, so it takes over the ballhandler.
- `driveToElbow` is a route option: `move: 'move'` with `branch: 'read'`. `elbowRead` has two options, and each coverage has a `great` one: `pullUp` against `soloDefense`, `dishToBig` against `bigSwitches`.

## Play data format

A play has these keys (`PlayScenario` in `src/content/plays.ts`); unknown keys are rejected.

- `kind`: always `'play'`.
- `id`: camelCase, matching the id pattern in `src/content/validate.ts`. It equals the file name.
- `name`, `blurb`, `concept`: text shown to the user.
- `difficulty`: an integer, 1 or more; 1 is the easiest.
- `playableRoles`: roles the user can control. A role must be `playable` in `src/content/data/roles.ts`.
- `setup`: `positions` for all five roles and the `ballHolder`.
- `phases`, `tracks`, `coverages`, `decisions`: described below.

Units: positions are meters on the half court. The origin is the court centre, and -z points toward the basket (x in -7.5 to 7.5, z in -7 to 7).

**Phases.** `phases[0]` is the start phase. A phase with no transitions is terminal, and at least one terminal phase must be reachable. A transition has a `to` phase and a `trigger`. The trigger kinds are in `TRIGGER_KINDS`: `reachedSpot`, `passCompleted`, `screenSet`, `timeElapsed` and `defenseReaction`.

**Tracks.** Each offensive role has a list of steps, at most one per phase. A step has a `phase`, an `action` from `TRACK_ACTIONS`, and a `spot`. `target` is required exactly on the actions in `TARGETED_TRACK_ACTIONS` (`setScreen`, `useScreen`, `handOff`, `pass`) and forbidden on the rest.

**Decisions and options.** A decision is a read the playable role makes in a phase. Each option has a `move`, an optional `target` and `branch`, and `grades`.

- `grades` has an entry for every coverage: `great`, `good` or `bad`. Each coverage needs at least one `great` option.
- What a grade does (`stepReferee` in `src/ai/referee.ts`): in Practice, any option below Great is a mistake with a whistle and reset. In Scrimmage, `bad` ends the run unsuccessful without a reset, and `good` continues the run.
- `target` is present exactly when the move is a pass (`chestPass`, `bouncePass`, `lob`, `handOff`).
- Two options may not share the same move, target and branch.
- Anything not listed is off-script: a mistake with a whistle and reset, not a Bad grade.

**Route options.** `branch` is present exactly when the move is `move` or `sprint` (every such option is a route option). It must name a phase that the decision's phase reaches through a `reachedSpot` transition of the decision's role. A `move` option and a `sprint` option may share a branch; `src/content/data/plays/driveAndKick.ts` does this.

## Coverages

A play has at least two coverages. Each has an `id`, a `name`, `practiceStandard` and a `script`.

- The first script step must be the start phase.
- A step lists a defender for every role, keyed by the offensive role the defender guards at setup. Each has a `spot` and an `action`.
- Phases not listed in a script keep the previous placements.
- Actions come from `DEFENDER_ACTIONS`: `guard`, `sag`, `help`, `closeout`, `closeoutHard`, `chaseOver`, `goUnder`, `switch`, `drop`, `hedge` and `recover`.
- `switch` needs `guards`, the offensive role the defender takes over from this phase on. It may not name the defender's own role. `guards` is forbidden on every other action.

## The Practice standard coverage

Exactly one coverage has `practiceStandard: true`. It is the base defence the play teaches against.

- In Practice mode there are no live defenders. The standard coverage's script is where the cones go.
- Scrimmage picks one of all the coverages (the standard included) for each run; the others appear only there.
- Read the existing plays for examples: `src/content/data/plays/giveAndGo.ts`, `src/content/data/plays/dribbleHandoff.ts`, `src/content/data/plays/driveAndKick.ts`, `src/content/data/plays/highPickAndRoll.ts` and `src/content/data/plays/hornsSet.ts` each mark one coverage this way.

## Cues

Each phase has `cues` for `full`, `reduced` and `none`. The `none` list must be empty. A list may hold at most one `prompt`.

- `CUE_KINDS` are `floorArrow` (`to`), `targetRing` (`role`), `spotMarker` (`spot`) and `prompt` (`text`, optional `reason`, optional `passTo`).
- Practice shows `full` cues and Scrimmage shows `reduced` cues. See `src/content/data/modes/practice.ts` and `src/content/data/modes/scrimmage.ts`.
- The mode's level is a ceiling. The user's cue toggles can only hide more (floor arrows, target rings, prompts). See `src/content/cues.ts`.

Concept tooltips are separate from cues. A phase's `concepts` are glossary ids from `src/content/data/glossary.ts`, at most two per phase, and `checkPhaseConcepts` rejects an unknown id.

## Shared behaviours

A new play gets these from engine code. Do not re-implement them in play data or play-specific code.

- Off-script handling: the whistle and reset. A reset waits for an in-flight shot to land.
- Screens and handoffs are automatic track actions. The play data says who sets or uses a screen or hands off; the engine runs it (`src/ai/playRun.ts`).
- Defender actions, including `switch`.
- Grading of route options and decisions.
- Shared bot behaviour in `src/ai/playBots.ts`.

The rule: a new need becomes a generic data field that the engine handles for every play, not play-specific code. `tests/lint/playAgnosticEngine.test.ts` enforces this.

## Bot tests

Registering the play automatically adds it to `src/ai/playCoverage.test.ts`, with no edit needed. There the correct-read bot must get Great, and the wrong-read bot must end in a mistake or a Bad, unsuccessful run. This runs in Practice on the standard coverage and in Scrimmage on every coverage. If that suite fails right after step 2, the play's grades or scripts are the first place to look.

Also create `src/ai/<playId>.test.ts` for the play-specific checks, following `src/ai/driveAndKick.test.ts`:

- Check the data shape.
- Check the per-read grades.
- Check cone clearance and that coverages look different from each other.

`src/ai/highPickAndRoll.test.ts` is an example that loads both Practice and Scrimmage.

The Give-and-Go bot tests live in `src/ai/playBots.test.ts`; that file is not the pattern to follow.

Run one file with `npm run test -- src/ai/<playId>.test.ts`, then run `npm run test`.

## Adding a role

Plays are data and so are roles.

1. Add the role to `RoleId` and `ROLE_ORDER` in `src/sim/state.ts`.
2. Add an entry in `src/content/data/roles.ts`. Use `playable: false` unless the user controls it.
3. Set its `defaultArchetype` in the roles.ts entry to an archetype id from `src/content/data/archetypes.ts` (add a new archetype there if needed).
4. Add a jersey in `src/content/data/teams.ts`.

`src/content/roles.ts` and `src/content/teams.ts` fail at load until every table covers the new role. Every play then needs setup positions, tracks and coverage defenders for it. Add a role to a play's `playableRoles` only together with a decision for it.
