import { describe, expect, it } from 'vitest';
import { startTutorial, stepTutorial, type TutorialState } from '../ai';
import { TUTORIAL_STEPS } from '../content';
import { DEFAULT_BINDINGS } from '../input';
import { loadAppContent } from './boot';
import { buildTutorialFrame, controlLabel, fillTutorialText } from './tutorialPrompt';

const CONTENT = loadAppContent();

function start(): TutorialState {
  return startTutorial({
    seed: 3,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
  });
}

describe('controlLabel', () => {
  it('labels the default bindings', () => {
    expect(controlLabel(DEFAULT_BINDINGS, 'shoot')).toBe('Space (gamepad: X)');
    expect(controlLabel(DEFAULT_BINDINGS, 'lob')).toBe('Double Left click or R (gamepad: Y)');
    expect(controlLabel(DEFAULT_BINDINGS, 'move')).toBe('W/A/S/D');
    expect(controlLabel(DEFAULT_BINDINGS, 'passTarget')).toBe('1/2/3/4');
    expect(controlLabel(DEFAULT_BINDINGS, 'sprint')).toBe(
      'Left Shift or Right Shift (gamepad: RT)',
    );
  });

  it('says so when nothing is bound', () => {
    const bindings = DEFAULT_BINDINGS.filter((b) => b.action !== 'floater');
    expect(controlLabel(bindings, 'floater')).toBe('an unbound control (set one in Settings)');
  });
});

describe('fillTutorialText', () => {
  it('replaces tokens and throws on an unknown one', () => {
    expect(fillTutorialText('Press {shoot}.', DEFAULT_BINDINGS)).toBe('Press Space (gamepad: X).');
    expect(() => fillTutorialText('Press {nope}.', DEFAULT_BINDINGS)).toThrow();
  });
});

describe('pass aim prompt', () => {
  const text = '{passAim}, then press {chestPass}.';

  it('mentions only the mouse in aim mode', () => {
    const out = fillTutorialText(text, DEFAULT_BINDINGS, 'aim');
    expect(out).toContain('with the mouse');
    expect(out).not.toContain('1/2/3/4');
  });

  it('mentions only the number keys in numbered mode', () => {
    const out = fillTutorialText(text, DEFAULT_BINDINGS, 'numbered');
    expect(out).toContain('1/2/3/4');
    expect(out).not.toContain('mouse');
  });

  it('mentions both in both mode', () => {
    const out = fillTutorialText(text, DEFAULT_BINDINGS, 'both');
    expect(out).toContain('with the mouse');
    expect(out).toContain('1/2/3/4');
  });

  it('follows the setting in the built frame', () => {
    const state = { ...start(), stepIndex: 2 };
    const frame = buildTutorialFrame(state, [], DEFAULT_BINDINGS, 'numbered');
    expect(frame.prompt.headline).not.toContain('mouse');
  });
});

describe('buildTutorialFrame', () => {
  it('shows the step counter objective and the stamina', () => {
    const state = start();
    const frame = buildTutorialFrame(state, [], DEFAULT_BINDINGS);
    expect(frame.hud.objective).toBe(
      `Tutorial · Step 1 of ${TUTORIAL_STEPS.length}: ${TUTORIAL_STEPS[0]!.title}`,
    );
    expect(frame.hud.stamina).toBeGreaterThanOrEqual(0);
    expect(frame.hud.stamina).toBeLessThanOrEqual(1);
    expect(frame.hud.banner).toBeNull();
    expect(frame.prompt.headline).toContain('W/A/S/D');
  });

  it('shows the retry line after a miss', () => {
    const state = { ...start(), stepIndex: 2, misses: 1 };
    const frame = buildTutorialFrame(state, [], DEFAULT_BINDINGS);
    expect(frame.prompt.reason).toContain('The pass did not work.');
  });

  it('shows the completion banner when finished and maps steps', () => {
    const state = start();
    const result = stepTutorial(state, []);
    const finished: TutorialState = { ...result.state, status: 'finished' };
    const frame = buildTutorialFrame(finished, [result], DEFAULT_BINDINGS);
    expect(frame.hud.banner).toEqual({ tone: 'success', text: 'Tutorial complete!' });
    expect(frame.steps).toHaveLength(1);
    expect(frame.steps[0]!.reset).toBe(false);
  });
});
