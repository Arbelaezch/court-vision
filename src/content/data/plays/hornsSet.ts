// Horns Set (DESIGN_DOC section 9): the PG at the top picks a side, the big on that side walks up and
// screens the PG's defender (the screen fires automatically), the PG comes off it and attacks, then
// reads what the defense does. Which side the defense is protecting is the decision: the side choice is
// graded (the `sideRead` decision), then the read at the end of the chosen branch.
// Left and right are from the PG facing the basket (-z): left is -x. The PF is the left big, the C
// the right big. The side choice is a route option (DecisionOption.branch).
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.
// `concepts` lists glossary term ids (src/content/data/glossary.ts) introduced in a phase.

export const HORNS_SET_FILE = 'src/content/data/plays/hornsSet.ts';

const PG_START = { x: 0, z: 3.0 };
const PF_ELBOW = { x: -1.6, z: -1.2 };
const C_ELBOW = { x: 1.6, z: -1.2 };
const SF_CORNER = { x: -6.5, z: -5.5 };
const SG_CORNER = { x: 6.5, z: -5.5 };

// Right side spots; the left side is the exact x-mirror.
const RIGHT_SIDE = { x: 1.5, z: 3.0 };
const RIGHT_SCREEN = { x: 2.3, z: 1.7 };
const RIGHT_COME_OFF = { x: 3.5, z: 2.4 };
const RIGHT_READ = { x: 2.4, z: -1.2 };
const RIGHT_ROLL = { x: 0.3, z: -4.0 };
const RIGHT_POP = { x: 2.6, z: -0.6 };
const LEFT_SIDE = { x: -1.5, z: 3.0 };
const LEFT_SCREEN = { x: -2.3, z: 1.7 };
const LEFT_COME_OFF = { x: -3.5, z: 2.4 };
const LEFT_READ = { x: -2.4, z: -1.2 };
const LEFT_ROLL = { x: -0.3, z: -4.0 };
const LEFT_POP = { x: -2.6, z: -0.6 };

const SCREENED_R = { x: 1.1, z: 1.3 };
const TRAIL_R = { x: 3.9, z: 0.6 };
const DROP_R = { x: 0.6, z: -3.0 };
const OVERPLAY_PG_R = { x: 0.7, z: 2.0 };
const OVERPLAY_BIG_R = { x: 1.9, z: -0.3 };
const CORNER_HELP_R = { x: 2.4, z: -3.6 };
const SCREENED_L = { x: -1.1, z: 1.3 };
const TRAIL_L = { x: -3.9, z: 0.6 };
const DROP_L = { x: -0.6, z: -3.0 };
const OVERPLAY_PG_L = { x: -0.7, z: 2.0 };
const OVERPLAY_BIG_L = { x: -1.9, z: -0.3 };
const CORNER_HELP_L = { x: -2.4, z: -3.6 };
// In dropBoth the other big also sags off the elbow big.
const DROP_OTHER_BIG_L = { x: 0.6, z: -3.2 };
const DROP_OTHER_BIG_R = { x: -0.6, z: -3.2 };

const ENTRY_DEFENDERS = {
  PG: { spot: { x: 0, z: 1.6 }, action: 'guard' },
  PF: { spot: { x: -1.1, z: -2.6 }, action: 'guard' },
  C: { spot: { x: 1.1, z: -2.6 }, action: 'guard' },
  SG: { spot: { x: 5.8, z: -5.2 }, action: 'guard' },
  SF: { spot: { x: -5.8, z: -5.2 }, action: 'guard' },
};

export const HORNS_SET_DATA = {
  kind: 'play',
  id: 'hornsSet',
  name: 'Horns Set',
  difficulty: 5,
  blurb: 'Two bigs, two options. Pick the side where the defense is weaker.',
  concept: "Pick the side the defense is not protecting, then read the screener's defender.",
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: PG_START,
      PF: PF_ELBOW,
      C: C_ELBOW,
      SF: SF_CORNER,
      SG: SG_CORNER,
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'choose',
      concepts: ['decisionPoint', 'coverage'],
      transitions: [
        { to: 'leftScreen', trigger: { kind: 'reachedSpot', role: 'PG', spot: LEFT_SIDE } },
        { to: 'rightScreen', trigger: { kind: 'reachedSpot', role: 'PG', spot: RIGHT_SIDE } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: LEFT_SIDE },
          { kind: 'floorArrow', to: RIGHT_SIDE },
          {
            kind: 'prompt',
            text: 'Pick a side',
            reason:
              "Go away from the side the defense is protecting. If both bigs' defenders sit back, either side works",
          },
        ],
        reduced: [
          { kind: 'floorArrow', to: LEFT_SIDE },
          { kind: 'floorArrow', to: RIGHT_SIDE },
          { kind: 'prompt', text: 'Pick a side' },
        ],
        none: [],
      },
    },
    {
      id: 'leftScreen',
      concepts: ['screen', 'pickAndRoll'],
      transitions: [{ to: 'leftComeOff', trigger: { kind: 'screenSet', screener: 'PF' } }],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Wait for the screen',
            reason: 'The PF is coming up to screen your defender',
          },
        ],
        reduced: [],
        none: [],
      },
    },
    {
      id: 'leftComeOff',
      transitions: [
        { to: 'leftAttack', trigger: { kind: 'reachedSpot', role: 'PG', spot: LEFT_COME_OFF } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: LEFT_COME_OFF },
          {
            kind: 'prompt',
            text: 'Use the screen',
            reason: "Come off the PF's shoulder so your defender gets caught on him",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: LEFT_COME_OFF }],
        none: [],
      },
    },
    {
      id: 'leftAttack',
      concepts: ['spacing'],
      transitions: [
        { to: 'leftRead', trigger: { kind: 'reachedSpot', role: 'PG', spot: LEFT_READ } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: LEFT_READ },
          {
            kind: 'prompt',
            text: 'Attack the gap',
            reason: "Get downhill and watch the bigs' defenders",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: LEFT_READ }],
        none: [],
      },
    },
    {
      id: 'leftRead',
      concepts: ['closeout'],
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read the defense',
            reason: 'Bigs sag: pull up or hit the C at the elbow. Corner help: kick to the SF',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read the defense' }],
        none: [],
      },
    },
    {
      id: 'rightScreen',
      concepts: ['screen', 'pickAndRoll'],
      transitions: [{ to: 'rightComeOff', trigger: { kind: 'screenSet', screener: 'C' } }],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Wait for the screen',
            reason: 'The C is coming up to screen your defender',
          },
        ],
        reduced: [],
        none: [],
      },
    },
    {
      id: 'rightComeOff',
      transitions: [
        { to: 'rightAttack', trigger: { kind: 'reachedSpot', role: 'PG', spot: RIGHT_COME_OFF } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: RIGHT_COME_OFF },
          {
            kind: 'prompt',
            text: 'Use the screen',
            reason: "Come off the C's shoulder so your defender gets caught on him",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: RIGHT_COME_OFF }],
        none: [],
      },
    },
    {
      id: 'rightAttack',
      concepts: ['spacing'],
      transitions: [
        { to: 'rightRead', trigger: { kind: 'reachedSpot', role: 'PG', spot: RIGHT_READ } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: RIGHT_READ },
          {
            kind: 'prompt',
            text: 'Attack the gap',
            reason: "Get downhill and watch the bigs' defenders",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: RIGHT_READ }],
        none: [],
      },
    },
    {
      id: 'rightRead',
      concepts: ['closeout'],
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read the defense',
            reason: 'Bigs sag: pull up or hit the PF at the elbow. Corner help: kick to the SG',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read the defense' }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'choose', action: 'hold', spot: PG_START },
      { phase: 'leftScreen', action: 'hold', spot: LEFT_SIDE },
      { phase: 'leftComeOff', action: 'useScreen', spot: LEFT_COME_OFF, target: 'PF' },
      { phase: 'leftAttack', action: 'drive', spot: LEFT_READ },
      { phase: 'leftRead', action: 'hold', spot: LEFT_READ },
      { phase: 'rightScreen', action: 'hold', spot: RIGHT_SIDE },
      { phase: 'rightComeOff', action: 'useScreen', spot: RIGHT_COME_OFF, target: 'C' },
      { phase: 'rightAttack', action: 'drive', spot: RIGHT_READ },
      { phase: 'rightRead', action: 'hold', spot: RIGHT_READ },
    ],
    PF: [
      { phase: 'choose', action: 'hold', spot: PF_ELBOW },
      { phase: 'leftScreen', action: 'setScreen', spot: LEFT_SCREEN, target: 'PG' },
      { phase: 'leftComeOff', action: 'cut', spot: LEFT_ROLL },
      { phase: 'rightScreen', action: 'space', spot: LEFT_POP },
    ],
    C: [
      { phase: 'choose', action: 'hold', spot: C_ELBOW },
      { phase: 'leftScreen', action: 'space', spot: RIGHT_POP },
      { phase: 'rightScreen', action: 'setScreen', spot: RIGHT_SCREEN, target: 'PG' },
      { phase: 'rightComeOff', action: 'cut', spot: RIGHT_ROLL },
    ],
    SG: [{ phase: 'choose', action: 'space', spot: SG_CORNER }],
    SF: [{ phase: 'choose', action: 'space', spot: SF_CORNER }],
  },
  coverages: [
    {
      id: 'overplayLeft',
      name: 'Overplay the left side',
      practiceStandard: false,
      script: [
        {
          phase: 'choose',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: OVERPLAY_PG_L, action: 'sag' },
            PF: { spot: OVERPLAY_BIG_L, action: 'sag' },
          },
        },
        {
          phase: 'rightComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_R, action: 'chaseOver' },
            PF: { spot: OVERPLAY_BIG_L, action: 'sag' },
            C: { spot: DROP_R, action: 'drop' },
          },
        },
        {
          phase: 'rightAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_R, action: 'chaseOver' },
            PF: { spot: OVERPLAY_BIG_L, action: 'sag' },
            C: { spot: DROP_R, action: 'drop' },
          },
        },
      ],
    },
    {
      id: 'overplayRight',
      name: 'Overplay the right side',
      practiceStandard: false,
      script: [
        {
          phase: 'choose',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: OVERPLAY_PG_R, action: 'sag' },
            C: { spot: OVERPLAY_BIG_R, action: 'sag' },
          },
        },
        {
          phase: 'leftComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
            C: { spot: OVERPLAY_BIG_R, action: 'sag' },
          },
        },
        {
          phase: 'leftAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
            C: { spot: OVERPLAY_BIG_R, action: 'sag' },
          },
        },
      ],
    },
    {
      id: 'dropBoth',
      name: 'Drop both bigs',
      practiceStandard: true,
      script: [
        { phase: 'choose', defenders: ENTRY_DEFENDERS },
        {
          phase: 'leftComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
            C: { spot: DROP_OTHER_BIG_L, action: 'drop' },
          },
        },
        {
          phase: 'leftAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
            C: { spot: DROP_OTHER_BIG_L, action: 'drop' },
          },
        },
        {
          phase: 'rightComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_R, action: 'chaseOver' },
            C: { spot: DROP_R, action: 'drop' },
            PF: { spot: DROP_OTHER_BIG_R, action: 'drop' },
          },
        },
        {
          phase: 'rightAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_R, action: 'chaseOver' },
            C: { spot: DROP_R, action: 'drop' },
            PF: { spot: DROP_OTHER_BIG_R, action: 'drop' },
          },
        },
      ],
    },
    {
      id: 'cornerHelp',
      name: 'Corner defender helps',
      practiceStandard: false,
      script: [
        { phase: 'choose', defenders: ENTRY_DEFENDERS },
        {
          phase: 'leftComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
          },
        },
        {
          phase: 'leftAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_L, action: 'chaseOver' },
            PF: { spot: DROP_L, action: 'drop' },
            SF: { spot: CORNER_HELP_L, action: 'help' },
          },
        },
        {
          phase: 'rightComeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_R, action: 'chaseOver' },
            C: { spot: DROP_R, action: 'drop' },
          },
        },
        {
          phase: 'rightAttack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_R, action: 'chaseOver' },
            C: { spot: DROP_R, action: 'drop' },
            SG: { spot: CORNER_HELP_R, action: 'help' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'sideRead',
      role: 'PG',
      phase: 'choose',
      options: [
        {
          id: 'useLeftScreen',
          move: 'move',
          branch: 'leftScreen',
          grades: {
            overplayLeft: 'bad',
            overplayRight: 'great',
            dropBoth: 'great',
            cornerHelp: 'great',
          },
        },
        {
          id: 'useRightScreen',
          move: 'move',
          branch: 'rightScreen',
          grades: {
            overplayLeft: 'great',
            overplayRight: 'bad',
            dropBoth: 'great',
            cornerHelp: 'great',
          },
        },
      ],
    },
    // The overplayLeft grades here are never reached in a run (going left into that overplay already
    // ended it); they exist because every decision needs a great option per coverage.
    {
      id: 'leftRead',
      role: 'PG',
      phase: 'leftRead',
      options: [
        {
          id: 'pullUp',
          move: 'shoot',
          grades: {
            overplayLeft: 'great',
            overplayRight: 'great',
            dropBoth: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'downhill',
          move: 'floater',
          grades: {
            overplayLeft: 'good',
            overplayRight: 'great',
            dropBoth: 'good',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'hitElbowBig',
          move: 'chestPass',
          target: 'C',
          grades: {
            overplayLeft: 'bad',
            overplayRight: 'good',
            dropBoth: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'kickToCorner',
          move: 'chestPass',
          target: 'SF',
          grades: {
            overplayLeft: 'bad',
            overplayRight: 'bad',
            dropBoth: 'bad',
            cornerHelp: 'great',
          },
        },
      ],
    },
    {
      id: 'rightRead',
      role: 'PG',
      phase: 'rightRead',
      options: [
        {
          id: 'pullUp',
          move: 'shoot',
          grades: {
            overplayLeft: 'great',
            overplayRight: 'great',
            dropBoth: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'downhill',
          move: 'floater',
          grades: {
            overplayLeft: 'great',
            overplayRight: 'good',
            dropBoth: 'good',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'hitElbowBig',
          move: 'chestPass',
          target: 'PF',
          grades: {
            overplayLeft: 'good',
            overplayRight: 'bad',
            dropBoth: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'kickToCorner',
          move: 'chestPass',
          target: 'SG',
          grades: {
            overplayLeft: 'bad',
            overplayRight: 'bad',
            dropBoth: 'bad',
            cornerHelp: 'great',
          },
        },
      ],
    },
  ],
};
