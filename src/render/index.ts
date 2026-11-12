// Rendering layer: reads simulation state and draws it, interpolating between fixed simulation steps.
export { createCourtScene } from './courtScene';
export { createTacticalCamera, fitTacticalCamera } from './tacticalCamera';
export { bindVisibilityPause } from './visibilityPause';
export type { VisibilityPauseOptions } from './visibilityPause';
export { mountRenderer } from './mountRenderer';
export {
  MARKER_TOP_OFFSET_M,
  bodyProportions,
  characterFitHeight,
  createCharacterLayer,
} from './characters';
export type { CharacterLayer, CharacterPose, CharacterRosterEntry } from './characters';
export { createPracticeCones } from './cones';
export type { ConeSpot } from './cones';
export { collectCastLabels, createLabelAtlas, layoutLabelAtlas } from './labelAtlas';
export type { LabelAtlas, LabelCell } from './labelAtlas';
export { countDrawCalls } from './drawCalls';
export { createDevScene, parseDevView } from './devView';
export type { DevView } from './devView';
