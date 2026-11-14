// App layer: per-play, per-mode attempt counters in the save store's progress section.
// Callers record a run only on its terminal outcome (g12): success:true for a success, and
// success:false for both a mistake and an unsuccessful run (an unsuccessful run counts as an
// attempt, not a success). Abandoned runs (quit or restart) are never recorded.
import { ID_PATTERN, type ModeId } from '../../content';
import type { ModeProgress } from './schema';
import type { SaveStore } from './store';

export interface RunAttemptRecord {
  readonly playId: string;
  readonly modeId: ModeId;
  readonly success: boolean;
}

/** Adds one attempt (and one success when `success`) and returns the new counters. */
export function recordRunAttempt(store: SaveStore, record: RunAttemptRecord): ModeProgress {
  const { playId, modeId, success } = record;
  // A malformed key would make the next load reset all progress, so refuse it here.
  if (!ID_PATTERN.test(playId)) {
    throw new Error(`Court Vision: cannot record progress for play "${playId}"`);
  }
  if (!ID_PATTERN.test(modeId)) {
    throw new Error(`Court Vision: cannot record progress for mode "${modeId}"`);
  }
  const plays = store.get('progress').plays;
  // Own-property reads only: ids like "constructor" must not resolve through the prototype.
  const playEntry = Object.hasOwn(plays, playId) ? plays[playId] : undefined;
  const prev = (playEntry !== undefined && Object.hasOwn(playEntry, modeId)
    ? playEntry[modeId]
    : undefined) ?? { attempts: 0, successes: 0 };
  const next: ModeProgress = {
    attempts: prev.attempts + 1,
    successes: prev.successes + (success ? 1 : 0),
  };
  store.set('progress', { plays: { ...plays, [playId]: { ...playEntry, [modeId]: next } } });
  return next;
}
