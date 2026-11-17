// Drive-and-Kick (DESIGN_DOC section 9): the PG drives at the rim from the top, the defense reacts,
// and the PG reads whether to kick out, finish, or float it.
// Units: positions are meters on the half court, origin at court centre, -z toward the basket
// (x in -7.5..7.5, z in -7..7; the rim is at about z -5.4).
// Rules: phases[0] is the start phase; a phase with no transitions is terminal. Tracks and coverage
// defenders are keyed by offensive role (a defender is keyed by the role it guards at setup). Each
// decision option grades every coverage great/good/bad; anything not listed is off-script. Exactly
// one coverage is the Practice standard, and its script places the Practice cones.
// `concepts` lists glossary term ids (src/content/data/glossary.ts) introduced in a phase.
// Sprint-by is the `sprintBy` sprint route of `beatCloseout` (#92). Walking the drive in
// aggressiveCloseout is Good. After the C's defender switches onto the PG, the dish to the C is the
// best read and scoring through is Good. helpSteps is the Practice standard.

export const DRIVE_AND_KICK_FILE = 'src/content/data/plays/driveAndKick.ts';

const PG_SPOT = { x: 0, z: 2.6 };
const SG_SPOT = { x: 6.8, z: -5.5 };
const SF_SPOT = { x: 5.2, z: -0.6 };
const PF_SPOT = { x: -5.2, z: -0.6 };
const C_SPOT = { x: -6.8, z: -5.5 };
const READ_SPOT = { x: 0.5, z: -2.8 };

const START_DEFENDERS = {
  PG: { spot: { x: -1.3, z: 1.0 }, action: 'sag' },
  SG: { spot: { x: 5.8, z: -5.2 }, action: 'guard' },
  SF: { spot: { x: 4.2, z: -1.3 }, action: 'guard' },
  PF: { spot: { x: -4.2, z: -1.3 }, action: 'guard' },
  C: { spot: { x: -5.8, z: -5.2 }, action: 'guard' },
};

const TRAILING_PG_DEFENDER = { spot: { x: -1.0, z: -0.8 }, action: 'sag' };

export const DRIVE_AND_KICK_DATA = {
  kind: 'play',
  id: 'driveAndKick',
  name: 'Drive-and-Kick',
  difficulty: 2,
  blurb: 'Drive at the rim and defenders have to react. Find who they leave open.',
  concept: 'Spacing: driving makes defenders move, and that creates open shooters.',
  playableRoles: ['PG'],
  setup: {
    positions: {
      PG: PG_SPOT,
      SG: SG_SPOT,
      SF: SF_SPOT,
      PF: PF_SPOT,
      C: C_SPOT,
    },
    ballHolder: 'PG',
  },
  phases: [
    {
      id: 'drive',
      concepts: ['spacing'],
      transitions: [{ to: 'read', trigger: { kind: 'reachedSpot', role: 'PG', spot: READ_SPOT } }],
      cues: {
        full: [
          { kind: 'floorArrow', to: READ_SPOT },
          {
            kind: 'prompt',
            text: 'Drive at the rim',
            reason: 'Make the defense react. If your man runs at you, sprint past him',
          },
        ],
        reduced: [{ kind: 'floorArrow', to: READ_SPOT }],
        none: [],
      },
    },
    {
      id: 'read',
      concepts: ['helpDefense', 'floater'],
      transitions: [],
      cues: {
        full: [
          {
            kind: 'prompt',
            text: 'Read the defense',
            reason:
              'Help steps in: kick it to the open shooter. No help: finish. Big at the rim: floater. Big switches onto you: dish to the corner',
          },
        ],
        reduced: [{ kind: 'prompt', text: 'Read the defense' }],
        none: [],
      },
    },
  ],
  tracks: {
    PG: [
      { phase: 'drive', action: 'drive', spot: READ_SPOT },
      { phase: 'read', action: 'hold', spot: READ_SPOT },
    ],
    SG: [{ phase: 'drive', action: 'space', spot: SG_SPOT }],
    SF: [{ phase: 'drive', action: 'space', spot: SF_SPOT }],
    PF: [{ phase: 'drive', action: 'space', spot: PF_SPOT }],
    C: [{ phase: 'drive', action: 'space', spot: C_SPOT }],
  },
  coverages: [
    {
      id: 'helpSteps',
      name: 'Help defender steps in',
      practiceStandard: true,
      script: [
        {
          phase: 'drive',
          defenders: { ...START_DEFENDERS, SG: { spot: { x: 3.4, z: -4.6 }, action: 'help' } },
        },
        {
          phase: 'read',
          defenders: {
            ...START_DEFENDERS,
            PG: TRAILING_PG_DEFENDER,
            SG: { spot: { x: 1.2, z: -4.4 }, action: 'help' },
          },
        },
      ],
    },
    {
      id: 'noHelp',
      name: 'No help',
      practiceStandard: false,
      script: [
        {
          phase: 'drive',
          defenders: { ...START_DEFENDERS, C: { spot: { x: -4.6, z: -4.6 }, action: 'sag' } },
        },
        {
          phase: 'read',
          defenders: {
            ...START_DEFENDERS,
            PG: TRAILING_PG_DEFENDER,
            C: { spot: { x: -4.6, z: -4.6 }, action: 'sag' },
          },
        },
      ],
    },
    {
      id: 'bigAtRim',
      name: 'Big stays at the rim',
      practiceStandard: false,
      script: [
        {
          phase: 'drive',
          defenders: { ...START_DEFENDERS, C: { spot: { x: 0.0, z: -5.0 }, action: 'drop' } },
        },
        {
          phase: 'read',
          defenders: {
            ...START_DEFENDERS,
            PG: TRAILING_PG_DEFENDER,
            C: { spot: { x: 0.0, z: -5.0 }, action: 'drop' },
          },
        },
      ],
    },
    {
      id: 'aggressiveCloseout',
      name: 'Defender closes out too hard',
      practiceStandard: false,
      script: [
        {
          phase: 'drive',
          defenders: {
            ...START_DEFENDERS,
            PG: { spot: { x: -1.6, z: 0.4 }, action: 'closeoutHard' },
            C: { spot: { x: 0.8, z: -4.9 }, action: 'sag' },
            PF: { spot: { x: -4.2, z: -1.3 }, action: 'sag' },
          },
        },
        {
          phase: 'read',
          defenders: {
            ...START_DEFENDERS,
            PG: TRAILING_PG_DEFENDER,
            C: { spot: { x: 0.6, z: -3.9 }, action: 'switch', guards: 'PG' },
            PF: { spot: { x: -4.2, z: -1.3 }, action: 'sag' },
          },
        },
      ],
    },
  ],
  decisions: [
    {
      id: 'beatCloseout',
      role: 'PG',
      phase: 'drive',
      options: [
        {
          id: 'driveOn',
          move: 'move',
          branch: 'read',
          grades: {
            helpSteps: 'great',
            noHelp: 'great',
            bigAtRim: 'great',
            aggressiveCloseout: 'good',
          },
        },
        {
          id: 'sprintBy',
          move: 'sprint',
          branch: 'read',
          grades: {
            helpSteps: 'great',
            noHelp: 'great',
            bigAtRim: 'great',
            aggressiveCloseout: 'great',
          },
        },
      ],
    },
    {
      id: 'driveRead',
      role: 'PG',
      phase: 'read',
      options: [
        {
          id: 'kickOut',
          move: 'chestPass',
          target: 'SG',
          grades: {
            helpSteps: 'great',
            noHelp: 'good',
            bigAtRim: 'good',
            aggressiveCloseout: 'good',
          },
        },
        {
          id: 'kickOutBounce',
          move: 'bouncePass',
          target: 'SG',
          grades: {
            helpSteps: 'great',
            noHelp: 'good',
            bigAtRim: 'good',
            aggressiveCloseout: 'good',
          },
        },
        {
          id: 'finishAtRim',
          move: 'shoot',
          grades: {
            helpSteps: 'bad',
            noHelp: 'great',
            bigAtRim: 'bad',
            aggressiveCloseout: 'good',
          },
        },
        {
          id: 'floatOver',
          move: 'floater',
          grades: {
            helpSteps: 'good',
            noHelp: 'good',
            bigAtRim: 'great',
            aggressiveCloseout: 'good',
          },
        },
        {
          id: 'dishToCorner',
          move: 'chestPass',
          target: 'C',
          grades: {
            helpSteps: 'bad',
            noHelp: 'bad',
            bigAtRim: 'bad',
            aggressiveCloseout: 'great',
          },
        },
        {
          id: 'dishToCornerBounce',
          move: 'bouncePass',
          target: 'C',
          grades: {
            helpSteps: 'bad',
            noHelp: 'bad',
            bigAtRim: 'bad',
            aggressiveCloseout: 'great',
          },
        },
      ],
    },
  ],
};
