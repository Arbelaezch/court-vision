// Team cast data: names, colors and jersey numbers. These are data so they can be personalized
// later. Render must read them from here via the content barrel rather than define its own.
// The tag is the non-color team channel (accessibility, DESIGN_DOC.md:147): short text drawn at
// each player's feet so offense and defense never rely on color alone.

export const TEAMS_FILE = 'src/content/data/teams.ts';

export const TEAMS_DATA = {
  offense: {
    name: 'Court Vision',
    tag: 'OFF',
    colors: { primary: '#1d4ed8', secondary: '#f8fafc' },
    jerseyNumbers: { PG: 3, SG: 11, SF: 23, PF: 34, C: 50 },
  },
  defense: {
    name: 'Opponents',
    tag: 'DEF',
    colors: { primary: '#dc2626', secondary: '#111827' },
    jerseyNumbers: { PG: 1, SG: 7, SF: 21, PF: 32, C: 44 },
  },
};
