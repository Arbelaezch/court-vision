// Basketball glossary shown under Tutorial and reused for first-time concept tooltips.
// Rules: ids are camelCase. `text` is one to three plain-language sentences with no jargon, each
// ending in `.`, `!` or `?`. Avoid abbreviations with inner periods such as "e.g." because the
// validator counts sentence ends. Plays name terms by id in a phase's `concepts` key.
// Unit: tooltipSeconds is seconds of sim time a tooltip stays on screen (1..30).
export const GLOSSARY_FILE = 'src/content/data/glossary.ts';

export const GLOSSARY_DATA = {
  tooltipSeconds: 6,
  terms: [
    {
      id: 'positions',
      term: 'Positions',
      text: 'A team has five players on the court, and each spot has a name. PG is the point guard (1), SG is the shooting guard (2), SF is the small forward (3), PF is the power forward (4) and C is the center (5).',
    },
    {
      id: 'spacing',
      term: 'Spacing',
      text: 'Spacing means the players stand far enough apart to give the ball handler room to move. Good spacing makes it hard for one defender to guard two players at once.',
    },
    {
      id: 'screen',
      term: 'Screen',
      text: 'A screen is when a player stands still beside a defender to block their path. This frees a teammate to dribble or cut past.',
    },
    {
      id: 'cut',
      term: 'Cut',
      text: 'A cut is a sharp run toward the basket or an open spot. Players cut to get open for a pass.',
    },
    {
      id: 'pickAndRoll',
      term: 'Pick-and-roll',
      text: 'One player sets a screen for the ball handler, then turns and moves toward the basket. The defense has to decide how to stop both players.',
    },
    {
      id: 'handoff',
      term: 'Handoff',
      text: 'A handoff is when a player hands the ball directly to a teammate who is running past. The teammate also gets a bit of a screen from the player who handed it over.',
    },
    {
      id: 'helpDefense',
      term: 'Help defense',
      text: 'Help defense is when a defender leaves their own player to stop a ball handler who got past a teammate. It can leave the player they left open.',
    },
    {
      id: 'closeout',
      term: 'Closeout',
      text: 'A closeout is when a defender runs quickly toward a player who just got the ball. Their goal is to stop an easy shot.',
    },
    {
      id: 'mismatch',
      term: 'Mismatch',
      text: 'A mismatch is when a player is guarded by someone who is a worse fit for the moment. For example, a taller player may be guarding a quicker one. A smart offense goes after it.',
    },
    {
      id: 'floater',
      term: 'Floater',
      text: 'A floater is a soft, high shot taken close to the basket. Players use it to shoot over a taller defender.',
    },
    {
      id: 'lob',
      term: 'Lob',
      text: 'A lob is a high pass thrown over the defense toward the basket. A teammate catches it near the rim.',
    },
    {
      id: 'bouncePass',
      term: 'Bounce pass',
      text: 'A bounce pass hits the floor once on the way to a teammate. It can get the ball past a defender who has their arms up.',
    },
    {
      id: 'play',
      term: 'Play',
      text: 'A play is a planned set of movements for all five players. Each one teaches a basic idea of offense.',
    },
    {
      id: 'possession',
      term: 'Possession (run)',
      text: 'A possession, or run, is one attempt at a play. It lasts from the starting positions until the team shoots, loses the ball or the run is reset.',
    },
    {
      id: 'coverage',
      term: 'Coverage',
      text: 'A coverage is the way the defense is planned to respond to a play. A play has several coverages, and one is picked each run. The right choice for you changes with it.',
    },
    {
      id: 'decisionPoint',
      term: 'Decision point',
      text: 'A decision point is a moment in a play where you must choose what to do, such as shoot or pass. Your choice is graded.',
    },
    {
      id: 'look',
      term: 'Look',
      text: 'A look is how good a shot chance is. It depends on how open you are, how close you are and how well set you are. It is rated Great, Good or Bad.',
    },
    {
      id: 'cue',
      term: 'Cue',
      text: 'A cue is a hint on screen that guides you. It can be an arrow on the floor, a ring around a teammate or a short message about what to do now.',
    },
    {
      id: 'practice',
      term: 'Practice',
      text: 'Practice is a mode where you run one play with no defenders. Cones mark where the defenders would stand, and you get the most guidance.',
    },
    {
      id: 'scrimmage',
      term: 'Scrimmage',
      text: 'Scrimmage is a mode where you run one play against five live defenders. It has Reduced cues and a slightly slower pace, so you have to read the defense yourself.',
    },
    {
      id: 'mastery',
      term: 'Mastery',
      text: 'Mastery counts your successful runs of a play in each mode. After a set number of successful runs, the play is marked Mastered.',
    },
  ],
};
