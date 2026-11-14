import { describe, expect, it } from 'vitest';
import { startRunController, type RunControllerState, type RunOutcome } from '../ai';
import { DEFAULT_CUE_TOGGLES, loadMode, type PlayScenario } from '../content';
import { loadAppContent } from './boot';
import { buildRunFrame } from './runFrame';

const CONTENT = loadAppContent();
const PLAY = CONTENT.plays.giveAndGo as PlayScenario;

function start(): RunControllerState {
  return startRunController(PLAY, loadMode('practice'), {
    seed: 1,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
  });
}

function withOutcome(
  c: RunControllerState,
  status: RunControllerState['status'],
  outcome: RunOutcome,
): RunControllerState {
  return { ...c, status, referee: { ...c.referee, outcome } };
}

describe('buildRunFrame', () => {
  it('shows Full cues and the prompt for the entry phase', () => {
    const frame = buildRunFrame(PLAY, start(), [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).toContainEqual({ kind: 'targetRing', role: 'SG' });
    expect(frame.prompt?.headline).toBe('Pass to the wing (1 SG)');
    expect(frame.hud.objective).toBe(PLAY.concept);
    expect(frame.hud.banner).toBeNull();
  });

  it('hides cues while a result shows', () => {
    const c = withOutcome(start(), 'showingResult', { kind: 'success', tick: 1, quality: 'great' });
    const frame = buildRunFrame(PLAY, c, [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).toEqual([]);
    expect(frame.prompt).toBeNull();
  });

  it('derives the banner from the outcome', () => {
    const banner = (c: RunControllerState) =>
      buildRunFrame(PLAY, c, [], DEFAULT_CUE_TOGGLES).hud.banner;
    expect(
      banner(withOutcome(start(), 'showingResult', { kind: 'success', tick: 1, quality: 'great' })),
    ).toEqual({ tone: 'success', text: 'Perfect run!' });
    expect(
      banner(withOutcome(start(), 'showingResult', { kind: 'success', tick: 1, quality: 'good' })),
    ).toEqual({ tone: 'success', text: 'Good run!' });
    expect(
      banner(withOutcome(start(), 'showingResult', { kind: 'unsuccessful', tick: 1, reason: 'x' })),
    ).toEqual({ tone: 'neutral', text: 'Not quite. Try again.' });
    expect(
      banner(
        withOutcome(start(), 'resetPending', {
          kind: 'mistake',
          tick: 1,
          mistakeKind: 'wrongTeammate',
          reason: 'x',
        }),
      ),
    ).toBeNull();
    expect(banner(start())).toBeNull();
  });

  it('reads stamina from the controlled player', () => {
    const c = start();
    const players = c.game.players.map((p) =>
      p.id === c.game.controlledPlayerId ? { ...p, stamina: 0.4 } : p,
    );
    const frame = buildRunFrame(
      PLAY,
      { ...c, game: { ...c.game, players } },
      [],
      DEFAULT_CUE_TOGGLES,
    );
    expect(frame.hud.stamina).toBe(0.4);
  });

  it('a prompts toggle of false gives no prompt', () => {
    const frame = buildRunFrame(PLAY, start(), [], { ...DEFAULT_CUE_TOGGLES, prompts: false });
    expect(frame.prompt).toBeNull();
    expect(frame.cues.length).toBeGreaterThan(0);
  });
});
