import { describe, expect, it } from 'vitest';
import {
  startRunController,
  stepRunController,
  type RunControllerState,
  type RunOutcome,
} from '../ai';
import { DEFAULT_CUE_TOGGLES, loadMode, type ModeConfig, type PlayScenario } from '../content';
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

const SCRIMMAGE: ModeConfig = {
  ...loadMode('practice'),
  id: 'scrimmageTest',
  rules: 'scrimmage',
  cueLevel: 'reduced',
  defense: 'live',
  shotClockSeconds: 24,
  decisionCueDelaySeconds: 1.5,
};

function startScrimmage(): RunControllerState {
  return startRunController(PLAY, SCRIMMAGE, {
    seed: 1,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
    coverageId: 'ballWatch',
  });
}

function stepN(c: RunControllerState, n: number): RunControllerState {
  let cur = c;
  for (let i = 0; i < n; i += 1) cur = stepRunController(PLAY, cur, []).controller;
  return cur;
}

const SG_RING = { kind: 'targetRing', role: 'SG' };

describe('buildRunFrame in Scrimmage', () => {
  it('holds back the entry target ring and prompt at phase start', () => {
    const frame = buildRunFrame(PLAY, startScrimmage(), [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).not.toContainEqual(SG_RING);
    expect(frame.prompt).toBeNull();
  });

  it('reveals decision cues after the delay', () => {
    const c = stepN(startScrimmage(), 90);
    expect(c.run.phaseId).toBe(startScrimmage().run.phaseId);
    const frame = buildRunFrame(PLAY, c, [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).toContainEqual(SG_RING);
  });

  it('reveals the target ring immediately when the target is open', () => {
    const c = startScrimmage();
    const game = structuredClone(c.game);
    const sg = game.players.find((p) => p.side === 'defense' && p.role === 'SG');
    if (sg === undefined) throw new Error('no SG defender');
    sg.pos = { x: 20, z: 20 };
    const frame = buildRunFrame(PLAY, { ...c, game }, [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).toContainEqual(SG_RING);
  });

  it('shows movement cues immediately in the cut phase', () => {
    let c = startScrimmage();
    const sg = c.game.players.find((p) => p.side === 'offense' && p.role === 'SG');
    if (sg === undefined) throw new Error('no SG');
    c = stepRunController(PLAY, c, [
      { type: 'pass', passType: 'chestPass', targetId: sg.id },
    ]).controller;
    for (let i = 0; i < 120 && c.run.phaseId !== 'cut'; i += 1) {
      c = stepRunController(PLAY, c, []).controller;
    }
    expect(c.run.phaseId).toBe('cut');
    const frame = buildRunFrame(PLAY, c, [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues.some((cue) => cue.kind === 'floorArrow')).toBe(true);
  });

  it('keeps Full cues at elapsed 0 in Practice', () => {
    const frame = buildRunFrame(PLAY, start(), [], DEFAULT_CUE_TOGGLES);
    expect(frame.cues).toContainEqual(SG_RING);
  });

  it('reports the shot clock', () => {
    const c = startScrimmage();
    expect(buildRunFrame(PLAY, c, [], DEFAULT_CUE_TOGGLES).hud.shotClockSeconds).toBe(24);
    expect(buildRunFrame(PLAY, start(), [], DEFAULT_CUE_TOGGLES).hud.shotClockSeconds).toBeNull();
    const later = stepN(c, 61);
    expect(buildRunFrame(PLAY, later, [], DEFAULT_CUE_TOGGLES).hud.shotClockSeconds).toBe(23);
  });

  it('banners Perfect and Good as successes', () => {
    const banner = (quality: 'great' | 'good') =>
      buildRunFrame(
        PLAY,
        withOutcome(startScrimmage(), 'showingResult', { kind: 'success', tick: 1, quality }),
        [],
        DEFAULT_CUE_TOGGLES,
      ).hud.banner;
    expect(banner('great')).toMatchObject({
      tone: 'success',
      text: expect.stringContaining('Perfect'),
    });
    expect(banner('good')).toMatchObject({
      tone: 'success',
      text: expect.stringContaining('Good'),
    });
  });
});
