// Give-and-Go (DESIGN_DOC section 9.1): the PG passes to the wing, cuts hard to the rim and gets
// the ball back.
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.

export const GIVE_AND_GO_FILE = 'src/content/data/plays/giveAndGo.ts';

export const GIVE_AND_GO_DATA = {
  kind: 'play',
  id: 'giveAndGo',
  name: 'Give-and-Go',
  difficulty: 1,
  blurb: 'After you pass, keep moving. Cut to the rim and your teammate can give it right back.',
  concept: "Don't stand still after you pass: pass, then cut to the basket.",
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: { x: 0, z: 2.5 },
      SG: { x: 5.5, z: -1 },
      SF: { x: -5.5, z: -1 },
      PF: { x: 7, z: -6 },
      C: { x: -7, z: -6 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'entry',
      transitions: [{ to: 'cut', trigger: { kind: 'passCompleted', from: 'PG', to: 'SG' } }],
      cues: {
        full: [
          { kind: 'targetRing', role: 'SG' },
          {
            kind: 'prompt',
            text: 'Pass to the wing',
            passTo: 'SG',
            reason: 'Then cut while your defender watches the ball',
          },
        ],
        reduced: [{ kind: 'targetRing', role: 'SG' }],
        none: [],
      },
    },
    {
      id: 'cut',
      transitions: [{ to: 'finish', trigger: { kind: 'passCompleted', from: 'SG', to: 'PG' } }],
      cues: {
        full: [
          { kind: 'floorArrow', to: { x: 0.8, z: -4 } },
          {
            kind: 'prompt',
            text: 'Cut to the rim!',
            reason: 'Your defender turned to watch the pass',
          },
        ],
        reduced: [{ kind: 'floorArrow', to: { x: 0.8, z: -4 } }],
        none: [],
      },
    },
    {
      id: 'finish',
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read the help',
            reason: 'Shoot if no help comes; kick out if it does',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read the help' }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'entry', action: 'pass', spot: { x: 0, z: 2.5 }, target: 'SG' },
      { phase: 'cut', action: 'cut', spot: { x: 0.8, z: -4 } },
      { phase: 'finish', action: 'receive', spot: { x: 0.8, z: -4 } },
    ],
    SG: [
      { phase: 'entry', action: 'receive', spot: { x: 5.5, z: -1 } },
      { phase: 'cut', action: 'pass', spot: { x: 5.5, z: -1 }, target: 'PG' },
    ],
    SF: [{ phase: 'entry', action: 'space', spot: { x: -5.5, z: -1 } }],
    PF: [{ phase: 'entry', action: 'space', spot: { x: 7, z: -6 } }],
    C: [{ phase: 'entry', action: 'space', spot: { x: -7, z: -6 } }],
  },
  coverages: [
    {
      id: 'ballWatch',
      name: 'Ball-watching defender',
      practiceStandard: true,
      script: [
        {
          phase: 'entry',
          defenders: {
            PG: { spot: { x: 0, z: 1.5 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -6, z: -5.9 }, action: 'guard' },
          },
        },
        {
          phase: 'cut',
          defenders: {
            PG: { spot: { x: 1.5, z: 0.5 }, action: 'sag' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -6, z: -5.9 }, action: 'guard' },
          },
        },
      ],
    },
    {
      id: 'helpOnCut',
      name: 'Help shows on the cut',
      practiceStandard: false,
      script: [
        {
          phase: 'entry',
          defenders: {
            PG: { spot: { x: 0, z: 1.5 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -5, z: -2 }, action: 'guard' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -6, z: -5.9 }, action: 'guard' },
          },
        },
        {
          phase: 'cut',
          defenders: {
            PG: { spot: { x: 0.5, z: -1 }, action: 'guard' },
            SG: { spot: { x: 5, z: -2 }, action: 'guard' },
            SF: { spot: { x: -1, z: -4.9 }, action: 'help' },
            PF: { spot: { x: 6, z: -5.9 }, action: 'guard' },
            C: { spot: { x: -6, z: -5.9 }, action: 'guard' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'finishRead',
      role: 'PG',
      phase: 'finish',
      options: [
        { id: 'layup', move: 'shoot', grades: { ballWatch: 'great', helpOnCut: 'bad' } },
        { id: 'floater', move: 'floater', grades: { ballWatch: 'good', helpOnCut: 'good' } },
        {
          id: 'kickToWing',
          move: 'chestPass',
          target: 'SF',
          grades: { ballWatch: 'good', helpOnCut: 'great' },
        },
      ],
    },
  ],
};
