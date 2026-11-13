// Test-only play fixture for the play-run engine (./playRun.ts). It is not a bundled play (it is
// not under src/content/data/plays/), so the playbook registry does not list it. It exercises the
// triggers the Give-and-Go fixture lacks: reachedSpot (walkUp -> screen), screenSet (screen ->
// roll, set automatically by the C, decision g4) and timeElapsed (roll -> finish).
// Units and rules as in src/content/data/plays/giveAndGo.ts.

export const SCREEN_TEST_PLAY_FILE = 'src/ai/testPlays.ts';

const WALK_UP_DEFENDERS = {
  PG: { spot: { x: 0, z: 4 }, action: 'guard' },
  SG: { spot: { x: 5, z: -2 }, action: 'guard' },
  SF: { spot: { x: -5, z: -2 }, action: 'guard' },
  PF: { spot: { x: 6, z: -5 }, action: 'guard' },
  C: { spot: { x: 2, z: -4 }, action: 'guard' },
};

export const SCREEN_TEST_PLAY_DATA = {
  kind: 'play',
  id: 'screenTest',
  name: 'Screen Test',
  difficulty: 1,
  blurb: 'Walk the ball up, use the screen from the C, and read the roll.',
  concept: 'Wait for the screen to be set before you use it.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: { x: 0, z: 5 },
      SG: { x: 5.5, z: -1 },
      SF: { x: -5.5, z: -1 },
      PF: { x: 6.5, z: -5.5 },
      C: { x: 2.5, z: -3 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'walkUp',
      transitions: [
        { to: 'screen', trigger: { kind: 'reachedSpot', role: 'PG', spot: { x: 0, z: 2 } } },
      ],
      cues: {
        full: [
          { kind: 'spotMarker', spot: { x: 0, z: 2 } },
          { kind: 'prompt', text: 'Walk the ball up' },
        ],
        reduced: [{ kind: 'spotMarker', spot: { x: 0, z: 2 } }],
        none: [],
      },
    },
    {
      id: 'screen',
      transitions: [{ to: 'roll', trigger: { kind: 'screenSet', screener: 'C' } }],
      cues: {
        full: [
          { kind: 'targetRing', role: 'C' },
          { kind: 'prompt', text: 'Wait for the screen' },
        ],
        reduced: [],
        none: [],
      },
    },
    {
      id: 'roll',
      transitions: [{ to: 'finish', trigger: { kind: 'timeElapsed', seconds: 1 } }],
      cues: {
        full: [
          { kind: 'floorArrow', to: { x: -1, z: -3 } },
          { kind: 'prompt', text: 'Use the screen!' },
        ],
        reduced: [{ kind: 'floorArrow', to: { x: -1, z: -3 } }],
        none: [],
      },
    },
    {
      id: 'finish',
      transitions: [],
      cues: {
        full: [{ kind: 'prompt', text: 'Read the roll' }],
        reduced: [],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'walkUp', action: 'moveTo', spot: { x: 0, z: 2 } },
      { phase: 'screen', action: 'useScreen', spot: { x: -1.5, z: 1 }, target: 'C' },
      { phase: 'roll', action: 'drive', spot: { x: -1, z: -3 } },
    ],
    C: [
      { phase: 'walkUp', action: 'space', spot: { x: 2.5, z: -3 } },
      { phase: 'screen', action: 'setScreen', spot: { x: 1.3, z: 2.4 }, target: 'PG' },
      { phase: 'roll', action: 'cut', spot: { x: 0.5, z: -4 } },
    ],
    SG: [{ phase: 'walkUp', action: 'moveTo', spot: { x: 4, z: 1 } }],
    SF: [{ phase: 'walkUp', action: 'space', spot: { x: -5.5, z: -1 } }],
    PF: [{ phase: 'walkUp', action: 'space', spot: { x: 6.5, z: -5.5 } }],
  },
  coverages: [
    {
      id: 'standard',
      name: 'Standard drop coverage',
      practiceStandard: true,
      script: [
        { phase: 'walkUp', defenders: WALK_UP_DEFENDERS },
        {
          phase: 'screen',
          defenders: {
            ...WALK_UP_DEFENDERS,
            PG: { spot: { x: -0.8, z: 1.2 }, action: 'chaseOver' },
          },
        },
      ],
    },
    {
      id: 'switchAll',
      name: 'Switch everything',
      practiceStandard: false,
      script: [{ phase: 'walkUp', defenders: WALK_UP_DEFENDERS }],
    },
  ],
  decisions: [
    {
      id: 'rollRead',
      role: 'PG',
      phase: 'roll',
      options: [
        {
          id: 'hitRoller',
          move: 'bouncePass',
          target: 'C',
          grades: { standard: 'great', switchAll: 'good' },
        },
        { id: 'pullUp', move: 'shoot', grades: { standard: 'good', switchAll: 'great' } },
      ],
    },
  ],
};
