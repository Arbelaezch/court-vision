// Controls tutorial script: the steps of the scripted sandbox as plain data. Per decision g6 this is
// its own sandbox, not play or scenario data. There is no call-for-screen step (decision g4: screens
// are automatic).
//
// Text may contain `{control}` tokens (a TutorialControl name, for example `{shoot}`); the app layer
// replaces each with the player's current binding label, so a rebind changes the prompt.
// Headless: only types are imported from the sim.

import type { CourtPoint } from '../sim';

export type TutorialStepId =
  'move' | 'sprint' | 'chestPass' | 'bouncePass' | 'lob' | 'shoot' | 'floater';

/** A control a prompt may name: every step control plus the pass-target keys. */
export type TutorialControl = TutorialStepId | 'passTarget';

/** `passAim` is not a control: the app layer fills it with the aim sentence for the pass-targeting mode. */
export const TUTORIAL_CONTROLS: readonly (TutorialControl | 'passAim')[] = [
  'passAim',
  'move',
  'sprint',
  'chestPass',
  'bouncePass',
  'lob',
  'shoot',
  'floater',
  'passTarget',
];

export type TutorialGoal =
  | { kind: 'move'; distanceM: number }
  | { kind: 'sprint'; seconds: number }
  | { kind: 'pass'; passType: 'chestPass' | 'bouncePass' | 'lob' }
  | { kind: 'shot'; floater: boolean };

export interface TutorialStep {
  readonly id: TutorialStepId;
  readonly title: string;
  /** The "do this now" line. */
  readonly instruction: string;
  /** Plain-language reason or context shown under the instruction. */
  readonly explain: string;
  /** Shown before `explain` after a wrong attempt, or null. */
  readonly retry: string | null;
  /** Where the human starts this step, holding the ball. */
  readonly start: CourtPoint;
  readonly goal: TutorialGoal;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    title: 'Move',
    instruction: 'Move around the court with {move}.',
    explain: 'You are the player with the ball. Walk a few steps in any direction.',
    retry: null,
    start: { x: 0, z: 2 },
    goal: { kind: 'move', distanceM: 3 },
  },
  {
    id: 'sprint',
    title: 'Sprint',
    instruction: 'Hold {sprint} while you move to run faster.',
    explain:
      'Sprinting is faster but tires you out. The stamina bar empties while you sprint and refills when you walk.',
    retry: null,
    start: { x: 0, z: 2 },
    goal: { kind: 'sprint', seconds: 1 },
  },
  {
    id: 'chestPass',
    title: 'Chest pass',
    instruction: '{passAim}, then press {chestPass} to throw a chest pass.',
    explain:
      'A chest pass is straight and fast. Use it when nobody is in the way of the pass. The cones are defenders (players trying to stop you) and they stand still here.',
    retry: 'The pass did not work. Try again.',
    start: { x: 0, z: 2 },
    goal: { kind: 'pass', passType: 'chestPass' },
  },
  {
    id: 'bouncePass',
    title: 'Bounce pass',
    instruction: '{passAim}, then press {bouncePass} to throw a bounce pass.',
    explain:
      'A bounce pass hits the floor once on the way, so it goes under a defender’s raised arms. Use it when a defender is close to you with their hands up.',
    retry: 'That was not a bounce pass. Try again.',
    start: { x: 0, z: 2 },
    goal: { kind: 'pass', passType: 'bouncePass' },
  },
  {
    id: 'lob',
    title: 'Lob pass',
    instruction: '{passAim}, then press {lob} to throw a lob.',
    explain:
      'A lob is high and soft, so it floats over a defender’s head. Use it when a teammate is running to the basket behind the defense. It is slower than the other passes.',
    retry: 'That was not a lob. Try again.',
    start: { x: 0, z: 2 },
    goal: { kind: 'pass', passType: 'lob' },
  },
  {
    id: 'shoot',
    title: 'Shoot',
    instruction: 'Press {shoot} to shoot at the hoop (the basket).',
    explain:
      'The game picks the right shot for where you stand: a layup (a shot from right next to the hoop) up close, a jump shot farther out. Made or missed both count here.',
    retry: 'The shot was not taken. Try again.',
    start: { x: 0, z: 1 },
    goal: { kind: 'shot', floater: false },
  },
  {
    id: 'floater',
    title: 'Floater',
    instruction: 'Stay close to the hoop and press {floater} to shoot a floater.',
    explain:
      'A floater is a soft, high shot taken near the hoop, often over a taller defender. It only works close to the hoop. Made or missed both count here.',
    retry: 'That was not a floater. Stay close to the hoop and try again.',
    start: { x: 0, z: -2 },
    goal: { kind: 'shot', floater: true },
  },
];

export const TUTORIAL_FINISHED: { readonly headline: string; readonly reason: string } = {
  headline: "You're ready!",
  reason: 'Open Practice from the main menu to try a play with these controls.',
};

/** The names inside `{...}` tokens of a text, in order. */
export function tutorialTokens(text: string): string[] {
  return Array.from(text.matchAll(/\{([^{}]*)\}/g), (match) => match[1] as string);
}
