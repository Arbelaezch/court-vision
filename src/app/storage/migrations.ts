// App layer: explicit, step-by-step save document migrations. MIGRATIONS[v] turns a v document into v+1.
//
// v1 shape (first shipped): {
//   version: 1,
//   progress, bindings, seenTooltips: same as v2,
//   settings: { passTargeting, doubleClickWindowMs, aimSensitivity, volume, musicOn, sfxOn, showCues },
// }
// v2 nests the audio fields under settings.audio and replaces the single showCues switch with
// per-cue toggles settings.cues = { floorArrows, targetRings, prompts } (decision g8).
// v3 has the same shape as v2, but music defaults off: settings.audio.musicOn is set to false, since
// any stored musicOn predates a music setting UI and is the old default rather than a player choice.
// v4 adds settings.reduceMotion (camera smoothing and banner animation off), set to false on migration.

export const CURRENT_VERSION = 4;

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Never throws; a settings value that is not an object passes through for section repair. */
export function migrateV1ToV2(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, version: 2 };
  if (isRecord(doc.settings)) {
    const { volume, musicOn, sfxOn, showCues, ...rest } = doc.settings;
    out.settings = {
      ...rest,
      audio: { volume, musicOn, sfxOn },
      cues: { floorArrows: showCues, targetRings: showCues, prompts: showCues },
    };
  }
  return out;
}

/** Never throws; settings or settings.audio that are not objects pass through for section repair. */
export function migrateV2ToV3(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, version: 3 };
  if (isRecord(doc.settings) && isRecord(doc.settings.audio)) {
    out.settings = { ...doc.settings, audio: { ...doc.settings.audio, musicOn: false } };
  }
  return out;
}

/** Never throws; a settings value that is not an object passes through for section repair. */
export function migrateV3ToV4(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, version: 4 };
  if (isRecord(doc.settings)) {
    out.settings = { ...doc.settings, reduceMotion: false };
  }
  return out;
}

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
};
