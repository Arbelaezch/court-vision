// App layer: explicit, step-by-step save document migrations. MIGRATIONS[v] turns a v document into v+1.
//
// v1 shape (first shipped): {
//   version: 1,
//   progress, bindings, seenTooltips: same as v2,
//   settings: { passTargeting, doubleClickWindowMs, aimSensitivity, volume, musicOn, sfxOn, showCues },
// }
// v2 nests the audio fields under settings.audio and replaces the single showCues switch with
// per-cue toggles settings.cues = { floorArrows, targetRings, prompts } (decision g8).

export const CURRENT_VERSION = 2;

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

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrateV1ToV2,
};
