// Game events: what the sim and decision layers emit and browser layers (audio, ui, app) consume.
// Types only, no runtime code.
//
// Delivery is synchronous: the loop that runs the sim step calls each GameEventSink with each event
// in the same animation frame as the step that produced it. Sinks act immediately and must not
// queue, so feedback such as the mistake whistle lands within one frame of the event.

export type MistakeKind = 'wrongTeammate' | 'offScript' | 'turnover';
export type RunGrade = 'perfect' | 'good';

/**
 * A game event. Whistle rule (.factory/decisions.md g2, g3 and "Bad look or blocked on-script
 * shot"): only `mistake` whistles. A mistake is a pass to the wrong teammate, an off-script action,
 * or a turnover (interception, out of bounds, shot-clock violation, blocked shot), and it resets the
 * run. A Bad look is `runUnsuccessful`: no whistle and no mistake reset. The producer decides which
 * outcomes are mistakes.
 */
export type GameEvent =
  | { type: 'mistake'; tick: number; kind: MistakeKind; reason: string }
  | { type: 'runSuccess'; tick: number; grade: RunGrade }
  | { type: 'runUnsuccessful'; tick: number; reason: string };

export type GameEventSink = (event: GameEvent) => void;
