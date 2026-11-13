// Game events: what the sim and decision layers emit and browser layers (audio, ui, app) consume.
// Types only, no runtime code.
//
// Delivery is synchronous: the loop that runs the sim step calls each GameEventSink with each event
// in the same animation frame as the step that produced it. Sinks act immediately and must not
// queue, so feedback such as the mistake whistle lands within one frame of the event.

import type { LookQuality, PassType, ShotType, ShotZone } from './state';

export type MistakeKind = 'wrongTeammate' | 'offScript' | 'turnover';
export type RunGrade = 'perfect' | 'good';

/**
 * A game event. Whistle rule (.factory/decisions.md g2, g3 and "Bad look or blocked on-script
 * shot"): only `mistake` whistles. A mistake is a pass to the wrong teammate, an off-script action,
 * or a turnover (interception, out of bounds, shot-clock violation, blocked shot), and it resets the
 * run. A Bad look is `runUnsuccessful`: no whistle and no mistake reset. The producer decides which
 * outcomes are mistakes. A completed pass (`passCompleted`) is not a mistake and does not whistle;
 * an intercepted pass is a `mistake` with kind `turnover`. Every resolved shot emits
 * `shotResolved`; a blocked shot also emits a `mistake` with kind `turnover`, and a Bad look that
 * was not blocked also emits `runUnsuccessful` (made or missed).
 */
export type GameEvent =
  | { type: 'mistake'; tick: number; kind: MistakeKind; reason: string }
  | {
      type: 'passCompleted';
      tick: number;
      passType: PassType;
      passerId: number;
      receiverId: number;
      /** Whether the receiver was set (nearly stationary) on the catch. */
      receiverSet: boolean;
    }
  | {
      type: 'shotResolved';
      tick: number;
      shooterId: number;
      shotType: ShotType;
      zone: ShotZone;
      look: LookQuality;
      /** Make chance in [0, 1] from the look and the shooter's zone rating. */
      makeChance: number;
      made: boolean;
      /** Defender who blocked the shot, or null. A block is also a `mistake` turnover. */
      blockerId: number | null;
      reason: string;
    }
  /**
   * Emitted by the play-run layer (src/ai) when an AI screener is set at its screen spot (decision
   * g4: screens are automatic). Not a mistake; never whistles.
   */
  | { type: 'screenSet'; tick: number; screenerId: number; targetId: number }
  | { type: 'runSuccess'; tick: number; grade: RunGrade }
  | { type: 'runUnsuccessful'; tick: number; reason: string };

export type GameEventSink = (event: GameEvent) => void;
