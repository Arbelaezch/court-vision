// Audio layer: maps game events to sounds.

import type { GameEvent } from '../sim';

export type SoundId = 'whistle' | 'chime';

// Only mistakes whistle; a Bad look (runUnsuccessful) is silent. See GameEvent in src/sim/events.ts.
export function soundForEvent(event: GameEvent): SoundId | null {
  switch (event.type) {
    case 'mistake':
      return 'whistle';
    case 'runSuccess':
      return 'chime';
    case 'runUnsuccessful':
      return null;
    default: {
      const unhandled: never = event;
      throw new Error(`Court Vision: unknown game event ${JSON.stringify(unhandled)}`);
    }
  }
}
