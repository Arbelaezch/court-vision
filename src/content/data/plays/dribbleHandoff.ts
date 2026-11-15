// Dribble Handoff (DESIGN_DOC section 9): the PG passes to the C, who walks up from the block; the
// PG then runs off the C (the handoff fires automatically) and turns the corner downhill.
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.
// `concepts` lists glossary term ids (src/content/data/glossary.ts) introduced in a phase.

export const DRIBBLE_HANDOFF_FILE = 'src/content/data/plays/dribbleHandoff.ts';

const CATCH_SPOT = { x: -0.3, z: 0.8 };
const C_HANDOFF_SPOT = { x: 0.2, z: 1.4 };
const READ_SPOT = { x: -0.6, z: -2.8 };

const ENTRY_DEFENDERS = {
  PG: { spot: { x: 2.4, z: 1.8 }, action: 'guard' },
  C: { spot: { x: 0.9, z: -4.7 }, action: 'guard' },
  SG: { spot: { x: 5.8, z: -5.2 }, action: 'guard' },
  SF: { spot: { x: -4.8, z: -1.4 }, action: 'guard' },
  PF: { spot: { x: -5.8, z: -5.2 }, action: 'guard' },
};

export const DRIBBLE_HANDOFF_DATA = {
  kind: 'play',
  id: 'dribbleHandoff',
  name: 'Dribble Handoff',
  difficulty: 3,
  blurb:
    'Take the ball from a big and use their body to shake your defender. Watch how the defender goes around it.',
  concept: 'Use a teammate as a moving screen, and read how your defender plays it.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: { x: 3, z: 3 },
      C: { x: 1.5, z: -4.2 },
      SG: { x: 6.5, z: -5.5 },
      SF: { x: -5.5, z: -0.5 },
      PF: { x: -6.5, z: -5.5 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'entry',
      transitions: [{ to: 'handoff', trigger: { kind: 'passCompleted', from: 'PG', to: 'C' } }],
      cues: {
        full: [
          { kind: 'targetRing', role: 'C' },
          {
            kind: 'prompt',
            text: 'Pass to the C',
            passTo: 'C',
            reason: 'He is coming up to hand it back',
          },
        ],
        reduced: [{ kind: 'targetRing', role: 'C' }],
        none: [],
      },
    },
    {
      id: 'handoff',
      concepts: ['handoff'],
      transitions: [{ to: 'attack', trigger: { kind: 'passCompleted', from: 'C', to: 'PG' } }],
      cues: {
        full: [
          { kind: 'floorArrow', to: CATCH_SPOT },
          {
            kind: 'prompt',
            text: 'Run off the C',
            reason: 'Take the handoff and use his body as a screen',
          },
        ],
        reduced: [{ kind: 'floorArrow', to: CATCH_SPOT }],
        none: [],
      },
    },
    {
      id: 'attack',
      transitions: [{ to: 'read', trigger: { kind: 'reachedSpot', role: 'PG', spot: READ_SPOT } }],
      cues: {
        full: [
          { kind: 'floorArrow', to: READ_SPOT },
          {
            kind: 'prompt',
            text: 'Turn the corner',
            reason: 'Get downhill, and sprint if there is space',
          },
        ],
        reduced: [{ kind: 'floorArrow', to: READ_SPOT }],
        none: [],
      },
    },
    {
      id: 'read',
      concepts: ['floater', 'mismatch'],
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read your defender',
            reason:
              'Trailing: keep going for the floater. Under: pull up. Switch: hit the C or attack the big',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read your defender' }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'entry', action: 'pass', spot: { x: 3, z: 3 }, target: 'C' },
      { phase: 'handoff', action: 'useScreen', spot: CATCH_SPOT, target: 'C' },
      { phase: 'attack', action: 'drive', spot: READ_SPOT },
      { phase: 'read', action: 'hold', spot: READ_SPOT },
    ],
    C: [
      { phase: 'entry', action: 'receive', spot: C_HANDOFF_SPOT },
      { phase: 'handoff', action: 'handOff', spot: C_HANDOFF_SPOT, target: 'PG' },
      { phase: 'attack', action: 'cut', spot: { x: 2.4, z: -3.4 } },
    ],
    SG: [{ phase: 'entry', action: 'space', spot: { x: 6.5, z: -5.5 } }],
    SF: [{ phase: 'entry', action: 'space', spot: { x: -5.5, z: -0.5 } }],
    PF: [{ phase: 'entry', action: 'space', spot: { x: -6.5, z: -5.5 } }],
  },
  coverages: [
    {
      id: 'overTheTop',
      name: 'Chase over the top',
      practiceStandard: true,
      script: [
        { phase: 'entry', defenders: ENTRY_DEFENDERS },
        {
          phase: 'handoff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 3.5, z: 4.8 }, action: 'chaseOver' },
          },
        },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 1.0, z: 3.6 }, action: 'chaseOver' },
          },
        },
      ],
    },
    {
      id: 'underTheScreen',
      name: 'Go under',
      practiceStandard: false,
      script: [
        { phase: 'entry', defenders: ENTRY_DEFENDERS },
        {
          phase: 'handoff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 1.4, z: -0.3 }, action: 'goUnder' },
          },
        },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 0.6, z: -4.0 }, action: 'goUnder' },
          },
        },
      ],
    },
    {
      id: 'switchOnHandoff',
      name: 'Switch',
      practiceStandard: false,
      script: [
        { phase: 'entry', defenders: ENTRY_DEFENDERS },
        { phase: 'handoff', defenders: ENTRY_DEFENDERS },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 0.8, z: 0.0 }, action: 'switch', guards: 'C' },
            C: { spot: { x: 0.0, z: 0.4 }, action: 'switch', guards: 'PG' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'handoffRead',
      role: 'PG',
      phase: 'read',
      options: [
        {
          id: 'hitScreener',
          move: 'bouncePass',
          target: 'C',
          grades: { overTheTop: 'bad', underTheScreen: 'bad', switchOnHandoff: 'great' },
        },
        {
          id: 'downhill',
          move: 'floater',
          grades: { overTheTop: 'great', underTheScreen: 'good', switchOnHandoff: 'great' },
        },
        {
          id: 'pullUp',
          move: 'shoot',
          grades: { overTheTop: 'good', underTheScreen: 'great', switchOnHandoff: 'bad' },
        },
      ],
    },
  ],
};
