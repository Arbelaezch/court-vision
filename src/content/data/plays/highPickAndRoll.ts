// High Pick-and-Roll (DESIGN_DOC section 9): the C walks up and screens the PG's defender (the
// screen fires automatically); the PG comes off it and attacks, then reads what the C's defender does.
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.

export const HIGH_PICK_AND_ROLL_FILE = 'src/content/data/plays/highPickAndRoll.ts';

const PG_START = { x: 0, z: 3.0 };
const SCREEN_SPOT = { x: 0.8, z: 1.7 };
const COME_OFF_SPOT = { x: 2.0, z: 2.4 };
const READ_SPOT = { x: 1.8, z: -1.6 };
const ROLL_SPOT = { x: -0.3, z: -4.0 };

const SCREENED_SPOT = { x: -0.4, z: 1.3 };
const TRAIL_SPOT = { x: 3.4, z: 0.6 };
const DROP_SPOT = { x: 0.3, z: -3.0 };
const HEDGE_SHOW_SPOT = { x: 3.1, z: 1.4 };
const HEDGE_RECOVER_SPOT = { x: 0.85, z: -2.7 };
const HIGH_SHOW_SPOT = { x: 2.7, z: -0.9 };
const TAG_SPOT = { x: -0.9, z: -4.6 };

const ENTRY_DEFENDERS = {
  PG: { spot: { x: 0, z: 1.6 }, action: 'guard' },
  C: { spot: { x: 1.1, z: -2.6 }, action: 'guard' },
  SG: { spot: { x: 5.8, z: -5.2 }, action: 'guard' },
  SF: { spot: { x: -4.8, z: -1.4 }, action: 'guard' },
  PF: { spot: { x: -5.8, z: -5.2 }, action: 'guard' },
};

export const HIGH_PICK_AND_ROLL_DATA = {
  kind: 'play',
  id: 'highPickAndRoll',
  name: 'High Pick-and-Roll',
  difficulty: 4,
  blurb: "A big sets a screen on your defender. What the big's defender does decides what you do.",
  concept: "Use the ball screen and read what the screener's defender does.",
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: PG_START,
      C: { x: 1.6, z: -1.2 },
      SG: { x: 6.5, z: -5.5 },
      SF: { x: -5.5, z: -0.5 },
      PF: { x: -6.5, z: -5.5 },
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'screen',
      transitions: [{ to: 'comeOff', trigger: { kind: 'screenSet', screener: 'C' } }],
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
      id: 'comeOff',
      transitions: [
        { to: 'attack', trigger: { kind: 'reachedSpot', role: 'PG', spot: COME_OFF_SPOT } },
      ],
      cues: {
        full: [
          { kind: 'floorArrow', to: COME_OFF_SPOT },
          {
            kind: 'prompt',
            text: 'Use the screen',
            reason: "Come off the C's shoulder so your defender gets caught on him",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: COME_OFF_SPOT }],
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
            text: 'Attack the gap',
            reason: "Get downhill and watch the C's defender",
          },
        ],
        reduced: [{ kind: 'floorArrow', to: READ_SPOT }],
        none: [],
      },
    },
    {
      id: 'read',
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: "Read the C's defender",
            reason:
              'Drop: pull up. Hedge: bounce it to the roller. Switch: lob to the C or attack the big. Corner help: kick to the corner',
          },
        ],
        reduced: [{ kind: 'prompt', text: "Read the C's defender" }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'screen', action: 'hold', spot: PG_START },
      { phase: 'comeOff', action: 'useScreen', spot: COME_OFF_SPOT, target: 'C' },
      { phase: 'attack', action: 'drive', spot: READ_SPOT },
      { phase: 'read', action: 'hold', spot: READ_SPOT },
    ],
    C: [
      { phase: 'screen', action: 'setScreen', spot: SCREEN_SPOT, target: 'PG' },
      { phase: 'comeOff', action: 'cut', spot: ROLL_SPOT },
    ],
    SG: [{ phase: 'screen', action: 'space', spot: { x: 6.5, z: -5.5 } }],
    SF: [{ phase: 'screen', action: 'space', spot: { x: -5.5, z: -0.5 } }],
    PF: [{ phase: 'screen', action: 'space', spot: { x: -6.5, z: -5.5 } }],
  },
  coverages: [
    {
      id: 'dropBig',
      name: 'Drop (big sags back)',
      practiceStandard: true,
      script: [
        { phase: 'screen', defenders: ENTRY_DEFENDERS },
        {
          phase: 'comeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_SPOT, action: 'chaseOver' },
            C: { spot: DROP_SPOT, action: 'drop' },
          },
        },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_SPOT, action: 'chaseOver' },
            C: { spot: DROP_SPOT, action: 'drop' },
          },
        },
      ],
    },
    {
      id: 'hedgeRecover',
      name: 'Hedge (big steps out, then recovers)',
      practiceStandard: false,
      script: [
        { phase: 'screen', defenders: ENTRY_DEFENDERS },
        {
          phase: 'comeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_SPOT, action: 'chaseOver' },
            C: { spot: HEDGE_SHOW_SPOT, action: 'hedge' },
          },
        },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_SPOT, action: 'chaseOver' },
            C: { spot: HEDGE_RECOVER_SPOT, action: 'hedge' },
          },
        },
      ],
    },
    {
      id: 'switchOnScreen',
      name: 'Switch',
      practiceStandard: false,
      script: [
        { phase: 'screen', defenders: ENTRY_DEFENDERS },
        {
          phase: 'comeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: { x: 0.4, z: 0.8 }, action: 'switch', guards: 'C' },
            C: { spot: { x: 1.2, z: 2.0 }, action: 'switch', guards: 'PG' },
          },
        },
      ],
    },
    {
      id: 'cornerHelp',
      name: 'Help from the corner on the roll',
      practiceStandard: false,
      script: [
        { phase: 'screen', defenders: ENTRY_DEFENDERS },
        {
          phase: 'comeOff',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: SCREENED_SPOT, action: 'chaseOver' },
            C: { spot: HEDGE_SHOW_SPOT, action: 'hedge' },
            PF: { spot: TAG_SPOT, action: 'help' },
          },
        },
        {
          phase: 'attack',
          defenders: {
            ...ENTRY_DEFENDERS,
            PG: { spot: TRAIL_SPOT, action: 'chaseOver' },
            C: { spot: HIGH_SHOW_SPOT, action: 'hedge' },
            PF: { spot: TAG_SPOT, action: 'help' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'pickRead',
      role: 'PG',
      phase: 'read',
      options: [
        {
          id: 'pullUp',
          move: 'shoot',
          grades: {
            dropBig: 'great',
            hedgeRecover: 'bad',
            switchOnScreen: 'bad',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'bounceToRoller',
          move: 'bouncePass',
          target: 'C',
          grades: {
            dropBig: 'bad',
            hedgeRecover: 'great',
            switchOnScreen: 'good',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'lobToRoller',
          move: 'lob',
          target: 'C',
          grades: {
            dropBig: 'bad',
            hedgeRecover: 'great',
            switchOnScreen: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'downhill',
          move: 'floater',
          grades: {
            dropBig: 'great',
            hedgeRecover: 'bad',
            switchOnScreen: 'great',
            cornerHelp: 'bad',
          },
        },
        {
          id: 'kickToCorner',
          move: 'chestPass',
          target: 'PF',
          grades: {
            dropBig: 'bad',
            hedgeRecover: 'bad',
            switchOnScreen: 'bad',
            cornerHelp: 'great',
          },
        },
      ],
    },
  ],
};
