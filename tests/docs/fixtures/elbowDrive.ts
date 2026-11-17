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
