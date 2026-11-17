// Test-only play fixtures for the play-run engine (./playRun.ts), the referee and the play bots.
// They are not bundled plays (not under src/content/data/plays/), so the playbook registry does not
// list them. Units and rules as in src/content/data/plays/giveAndGo.ts.
//
// - screenTest exercises the triggers the Give-and-Go fixture lacks: reachedSpot (walkUp ->
//   screen), screenSet (screen -> roll, set automatically by the C, decision g4) and timeElapsed
//   (roll -> finish).
// - routeTest exercises route options (DecisionOption.branch): the PG picks a side by walking to
//   it, and the side is graded per coverage. The left branch comes first in the phases array and
//   ends on a pass, so a run going left only ends if "later decision" means reachable, not later in
//   the array.
// - sprintTest exercises sprint route options: a `move` and a `sprint` option share one branch,
//   and the referee grades the one matching whether the PG sprinted on the way.

export const SCREEN_TEST_PLAY_FILE = 'src/ai/testPlays.ts';
export const ROUTE_TEST_PLAY_FILE = 'src/ai/testPlays.ts';
export const SPRINT_TEST_PLAY_FILE = 'src/ai/testPlays.ts';

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

// Inside shooting range (8.5 m from the rim), so the right branch's pull-up is not out of range.
const ROUTE_START_SPOT = { x: 0, z: 1.5 };
const ROUTE_LEFT_SPOT = { x: -2, z: 1.5 };
const ROUTE_RIGHT_SPOT = { x: 2, z: 1.5 };

// Every defender guards its man; set off the passing lanes so the kick pass completes.
const ROUTE_DEFENDERS = {
  PG: { spot: { x: 0, z: 0.3 }, action: 'guard' },
  SG: { spot: { x: 5.5, z: -2.5 }, action: 'guard' },
  SF: { spot: { x: -5.5, z: -2.5 }, action: 'guard' },
  PF: { spot: { x: 5.5, z: -5.5 }, action: 'guard' },
  C: { spot: { x: -5.5, z: -5.5 }, action: 'guard' },
};

export const ROUTE_TEST_PLAY_DATA = {
  kind: 'play',
  id: 'routeTest',
  name: 'Route Test',
  difficulty: 1,
  blurb: 'Pick a side by walking to it, then finish.',
  concept: 'Go away from the side the defense protects.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: ROUTE_START_SPOT,
      SG: { x: 5.5, z: -1 },
      SF: { x: -5.5, z: -1 },
      PF: { x: 6.5, z: -5.5 },
      C: { x: -6.5, z: -5.5 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'pick',
      transitions: [
        { to: 'goLeft', trigger: { kind: 'reachedSpot', role: 'PG', spot: ROUTE_LEFT_SPOT } },
        { to: 'goRight', trigger: { kind: 'reachedSpot', role: 'PG', spot: ROUTE_RIGHT_SPOT } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: ROUTE_LEFT_SPOT },
          { kind: 'floorArrow', to: ROUTE_RIGHT_SPOT },
          { kind: 'prompt', text: 'Pick a side' },
        ],
        reduced: [],
        none: [],
      },
    },
    {
      id: 'goLeft',
      transitions: [],
      cues: { full: [{ kind: 'prompt', text: 'Kick it' }], reduced: [], none: [] },
    },
    {
      id: 'goRight',
      transitions: [],
      cues: { full: [{ kind: 'prompt', text: 'Pull up' }], reduced: [], none: [] },
    },
  ],
  tracks: {
    PG: [
      { phase: 'pick', action: 'hold', spot: ROUTE_START_SPOT },
      { phase: 'goLeft', action: 'hold', spot: ROUTE_LEFT_SPOT },
      { phase: 'goRight', action: 'hold', spot: ROUTE_RIGHT_SPOT },
    ],
    SG: [{ phase: 'pick', action: 'space', spot: { x: 5.5, z: -1 } }],
    SF: [{ phase: 'pick', action: 'space', spot: { x: -5.5, z: -1 } }],
    PF: [{ phase: 'pick', action: 'space', spot: { x: 6.5, z: -5.5 } }],
    C: [{ phase: 'pick', action: 'space', spot: { x: -6.5, z: -5.5 } }],
  },
  coverages: [
    {
      id: 'shadeLeft',
      name: 'Shade the left side',
      practiceStandard: true,
      script: [{ phase: 'pick', defenders: ROUTE_DEFENDERS }],
    },
    {
      id: 'shadeRight',
      name: 'Shade the right side',
      practiceStandard: false,
      script: [{ phase: 'pick', defenders: ROUTE_DEFENDERS }],
    },
    {
      // Neither side protected: left is a Good route, right the Great one.
      id: 'even',
      name: 'Even',
      practiceStandard: false,
      script: [{ phase: 'pick', defenders: ROUTE_DEFENDERS }],
    },
  ],
  decisions: [
    {
      id: 'routePick',
      role: 'PG',
      phase: 'pick',
      options: [
        {
          id: 'leanLeft',
          move: 'move',
          branch: 'goLeft',
          grades: { shadeLeft: 'bad', shadeRight: 'great', even: 'good' },
        },
        {
          id: 'leanRight',
          move: 'move',
          branch: 'goRight',
          grades: { shadeLeft: 'great', shadeRight: 'bad', even: 'great' },
        },
      ],
    },
    {
      id: 'leftFinish',
      role: 'PG',
      phase: 'goLeft',
      options: [
        {
          id: 'kick',
          move: 'chestPass',
          target: 'SF',
          grades: { shadeLeft: 'great', shadeRight: 'great', even: 'great' },
        },
      ],
    },
    {
      id: 'rightFinish',
      role: 'PG',
      phase: 'goRight',
      options: [
        {
          id: 'pullUp',
          move: 'shoot',
          grades: { shadeLeft: 'great', shadeRight: 'great', even: 'great' },
        },
      ],
    },
  ],
};

// One route to `finish`, taken walking (`walkIn`) or sprinting (`sprintIn`). `rushes` wants the
// sprint (walking is Good), `sits` takes either, and `walls` punishes the sprint (Bad).
export const SPRINT_TEST_PLAY_DATA = {
  kind: 'play',
  id: 'sprintTest',
  name: 'Sprint Test',
  difficulty: 1,
  blurb: 'Get to the spot, sprinting when the defense rushes you, then kick it out.',
  concept: 'Beat a rushing defender with speed.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: ROUTE_START_SPOT,
      SG: { x: 5.5, z: -1 },
      SF: { x: -5.5, z: -1 },
      PF: { x: 6.5, z: -5.5 },
      C: { x: -6.5, z: -5.5 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'approach',
      transitions: [
        { to: 'finish', trigger: { kind: 'reachedSpot', role: 'PG', spot: ROUTE_RIGHT_SPOT } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: ROUTE_RIGHT_SPOT },
          { kind: 'prompt', text: 'Get to the spot' },
        ],
        reduced: [],
        none: [],
      },
    },
    {
      id: 'finish',
      transitions: [],
      cues: { full: [{ kind: 'prompt', text: 'Kick it' }], reduced: [], none: [] },
    },
  ],
  tracks: {
    PG: [
      { phase: 'approach', action: 'hold', spot: ROUTE_START_SPOT },
      { phase: 'finish', action: 'hold', spot: ROUTE_RIGHT_SPOT },
    ],
    SG: [{ phase: 'approach', action: 'space', spot: { x: 5.5, z: -1 } }],
    SF: [{ phase: 'approach', action: 'space', spot: { x: -5.5, z: -1 } }],
    PF: [{ phase: 'approach', action: 'space', spot: { x: 6.5, z: -5.5 } }],
    C: [{ phase: 'approach', action: 'space', spot: { x: -6.5, z: -5.5 } }],
  },
  coverages: [
    {
      id: 'rushes',
      name: 'Rushes the ball',
      practiceStandard: true,
      script: [{ phase: 'approach', defenders: ROUTE_DEFENDERS }],
    },
    {
      id: 'sits',
      name: 'Sits back',
      practiceStandard: false,
      script: [{ phase: 'approach', defenders: ROUTE_DEFENDERS }],
    },
    {
      id: 'walls',
      name: 'Walls off the sprint',
      practiceStandard: false,
      script: [{ phase: 'approach', defenders: ROUTE_DEFENDERS }],
    },
  ],
  decisions: [
    {
      id: 'approachRead',
      role: 'PG',
      phase: 'approach',
      options: [
        {
          id: 'walkIn',
          move: 'move',
          branch: 'finish',
          grades: { rushes: 'good', sits: 'great', walls: 'great' },
        },
        {
          id: 'sprintIn',
          move: 'sprint',
          branch: 'finish',
          grades: { rushes: 'great', sits: 'great', walls: 'bad' },
        },
      ],
    },
    {
      // A kick, not a pull-up: a jump shot straight out of a sprint is off balance (a Bad look).
      id: 'finishKick',
      role: 'PG',
      phase: 'finish',
      options: [
        {
          id: 'kick',
          move: 'chestPass',
          target: 'SG',
          grades: { rushes: 'great', sits: 'great', walls: 'great' },
        },
      ],
    },
  ],
};
