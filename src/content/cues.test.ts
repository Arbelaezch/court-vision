import { describe, expect, it } from 'vitest';
import { loadCastContent } from './cast';
import {
  DEFAULT_CUE_TOGGLES,
  phaseCues,
  promptForCues,
  visibleCues,
  type CueToggles,
} from './cues';
import { CUE_LEVELS, type Cue, type Phase, type PlayScenario } from './plays';
import { loadPlaybook } from './playbook';

const play = loadPlaybook(loadCastContent().roles)['giveAndGo'] as PlayScenario;

function kinds(cues: readonly Cue[]): string[] {
  return cues.map((c) => c.kind);
}

function phase(id: string): Phase {
  return play.phases.find((p) => p.id === id) as Phase;
}

describe('visibleCues', () => {
  it('shows the full cues of each phase with all toggles on', () => {
    expect(kinds(visibleCues(phase('entry'), 'full', DEFAULT_CUE_TOGGLES))).toEqual([
      'targetRing',
      'prompt',
    ]);
    expect(kinds(visibleCues(phase('cut'), 'full', DEFAULT_CUE_TOGGLES))).toEqual([
      'floorArrow',
      'prompt',
    ]);
  });

  it('shows nothing at level none', () => {
    for (const p of play.phases) {
      expect(visibleCues(p, 'none', DEFAULT_CUE_TOGGLES)).toEqual([]);
    }
  });

  it('shows the Reduced cues of each phase', () => {
    expect(visibleCues(phase('entry'), 'reduced', DEFAULT_CUE_TOGGLES)).toEqual([
      { kind: 'targetRing', role: 'SG' },
    ]);
    expect(visibleCues(phase('cut'), 'reduced', DEFAULT_CUE_TOGGLES)).toEqual([
      { kind: 'floorArrow', to: { x: 0.8, z: -4 } },
    ]);
    const finish = visibleCues(phase('finish'), 'reduced', DEFAULT_CUE_TOGGLES);
    expect(finish).toEqual([{ kind: 'prompt', text: 'Read the help' }]);
    expect(promptForCues(finish)).toEqual({ headline: 'Read the help', reason: null });
    expect(promptForCues(visibleCues(phase('entry'), 'reduced', DEFAULT_CUE_TOGGLES))).toBeNull();
  });

  it('removes only the toggled-off kind', () => {
    const off = (key: keyof CueToggles): CueToggles => ({ ...DEFAULT_CUE_TOGGLES, [key]: false });
    expect(kinds(visibleCues(phase('cut'), 'full', off('floorArrows')))).toEqual(['prompt']);
    expect(kinds(visibleCues(phase('entry'), 'full', off('targetRings')))).toEqual(['prompt']);
    expect(kinds(visibleCues(phase('entry'), 'full', off('prompts')))).toEqual(['targetRing']);
    expect(kinds(visibleCues(phase('cut'), 'full', off('prompts')))).toEqual(['floorArrow']);
  });

  it('hides spot markers with the targetRings toggle', () => {
    const synthetic: Phase = {
      id: 'x',
      transitions: [],
      cues: {
        full: [
          { kind: 'spotMarker', spot: { x: 0, z: 0 } },
          { kind: 'prompt', text: 'Go' },
        ],
        reduced: [],
        none: [],
      },
    };
    expect(kinds(visibleCues(synthetic, 'full', DEFAULT_CUE_TOGGLES))).toEqual([
      'spotMarker',
      'prompt',
    ]);
    expect(
      kinds(visibleCues(synthetic, 'full', { ...DEFAULT_CUE_TOGGLES, targetRings: false })),
    ).toEqual(['prompt']);
    expect(CUE_LEVELS).toContain('full');
  });
});

describe('phaseCues', () => {
  it('resolves a phase by id', () => {
    expect(kinds(phaseCues(play, 'cut', 'full', DEFAULT_CUE_TOGGLES))).toEqual([
      'floorArrow',
      'prompt',
    ]);
  });

  it('throws on an unknown phase id', () => {
    expect(() => phaseCues(play, 'nope', 'full', DEFAULT_CUE_TOGGLES)).toThrow(
      /unknown phase "nope" in play "giveAndGo"/,
    );
  });
});

describe('promptForCues', () => {
  it('adds the key badge to a pass prompt and keeps the reason', () => {
    const prompt = promptForCues(visibleCues(phase('entry'), 'full', DEFAULT_CUE_TOGGLES));
    expect(prompt).toEqual({
      headline: 'Pass to the wing (1 SG)',
      reason: 'Then cut while your defender watches the ball',
    });
    expect(prompt?.headline).toContain('1');
    expect(prompt?.headline).toContain('SG');
  });

  it('uses the plain text for a non-pass prompt', () => {
    const prompt = promptForCues(visibleCues(phase('cut'), 'full', DEFAULT_CUE_TOGGLES));
    expect(prompt?.headline).toBe('Cut to the rim!');
  });

  it('returns null with no prompt cue', () => {
    expect(promptForCues([])).toBeNull();
  });
});
