// Audio layer: maps game events to sounds.

import type { GameEvent } from '../sim';

export type SoundId =
  | 'whistle'
  | 'chime'
  | 'dribble'
  | 'passChest'
  | 'passBounce'
  | 'passLob'
  | 'catch'
  | 'shotRelease'
  | 'swish'
  | 'rimHit'
  | 'screenContact'
  | 'footstep'
  | 'uiClick';

// Only mistakes whistle; a Bad look (runUnsuccessful) is silent. See GameEvent in src/sim/events.ts.
export function soundForEvent(event: GameEvent): SoundId | null {
  switch (event.type) {
    case 'mistake':
      return 'whistle';
    case 'runSuccess':
      return 'chime';
    case 'runUnsuccessful':
      return null;
    // A completed pass is the catch; it never whistles. The release sound comes from the sound director.
    case 'passCompleted':
      return 'catch';
    // The release flick; swish/rim-hit are timed by the sound director. A block also whistles via `mistake`.
    case 'shotResolved':
      return 'shotRelease';
    // An automatic screen (decision g4) is not a mistake and never whistles; contact sounds when it is set.
    case 'screenSet':
      return 'screenContact';
    default: {
      const unhandled: never = event;
      throw new Error(`Court Vision: unknown game event ${JSON.stringify(unhandled)}`);
    }
  }
}
