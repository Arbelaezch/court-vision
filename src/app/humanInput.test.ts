import { describe, expect, it } from 'vitest';
import { loadMode, type PlayScenario } from '../content';
import { startRunController, type RunControllerState } from '../ai';
import type { CourtPoint, RoleId } from '../sim';
import { loadAppContent } from './boot';
import { createHumanInput, type HeldInput } from './humanInput';

const CONTENT = loadAppContent();
const PLAY = CONTENT.plays.giveAndGo as PlayScenario;
const PRACTICE = loadMode('practice');

function start(seed = 1): RunControllerState {
  return startRunController(PLAY, PRACTICE, {
    seed,
    movement: CONTENT.movement,
    passing: CONTENT.passing,
    shooting: CONTENT.shooting,
  });
}

function idOf(c: RunControllerState, role: RoleId): number {
  const p = c.game.players.find((q) => q.role === role);
  if (!p) throw new Error(`no ${role}`);
  return p.id;
}

function make(overrides: { held?: HeldInput; aim?: CourtPoint | null } = {}) {
  const held: HeldInput = overrides.held ?? { axes: { x: 0, y: 0 }, sprint: false, pivot: false };
  return createHumanInput({
    held: () => held,
    aimAt: () => overrides.aim ?? null,
    targeting: () => ({ mode: 'both', aimSensitivity: 1 }),
  });
}

describe('human input', () => {
  it('maps axes to sim move (screen up is -z) and passes sprint and pivot', () => {
    const input = make({ held: { axes: { x: 0.5, y: 1 }, sprint: true, pivot: true } });
    expect(input.actionsFor(start())).toEqual([
      { type: 'move', x: 0.5, z: -1 },
      { type: 'sprint', held: true },
      { type: 'pivot', held: true },
    ]);
  });

  it('passes to the keyed teammate by role', () => {
    const c = start();
    const input = make();
    input.press('passTarget1');
    input.press('chestPass');
    expect(input.actionsFor(c)).toContainEqual({
      type: 'pass',
      passType: 'chestPass',
      targetId: idOf(c, 'SG'),
    });
    input.press('passTarget2');
    input.press('bouncePass');
    expect(input.actionsFor(c)).toContainEqual({
      type: 'pass',
      passType: 'bouncePass',
      targetId: idOf(c, 'SF'),
    });
  });

  it('emits presses once', () => {
    const c = start();
    const input = make();
    input.press('passTarget1');
    input.press('chestPass');
    input.press('shoot');
    input.press('floater');
    const first = input.actionsFor(c);
    expect(first.map((a) => a.type)).toEqual([
      'move',
      'sprint',
      'pivot',
      'pass',
      'shoot',
      'floater',
    ]);
    expect(input.actionsFor(c).map((a) => a.type)).toEqual(['move', 'sprint', 'pivot']);
  });

  it('clears the selected key after a pass and when the run changes', () => {
    const c = start();
    const input = make();
    input.press('passTarget1');
    input.press('chestPass');
    input.actionsFor(c);
    input.press('chestPass');
    expect(input.actionsFor(c).some((a) => a.type === 'pass')).toBe(false);

    input.press('passTarget1');
    const next = { ...c, runIndex: c.runIndex + 1 };
    input.press('chestPass');
    expect(input.actionsFor(next).some((a) => a.type === 'pass')).toBe(false);
    input.press('chestPass');
    expect(input.actionsFor(next).some((a) => a.type === 'pass')).toBe(false);
  });

  it('drops a pass with no key and no aim point, and aims at the SG when given its position', () => {
    const c = start();
    const input = make();
    input.press('chestPass');
    expect(input.actionsFor(c).some((a) => a.type === 'pass')).toBe(false);

    const sg = c.game.players.find((p) => p.role === 'SG')!;
    const aimed = make({ aim: { x: sg.pos.x, z: sg.pos.z } });
    aimed.press('chestPass');
    expect(aimed.actionsFor(c)).toContainEqual({
      type: 'pass',
      passType: 'chestPass',
      targetId: sg.id,
    });
  });

  it('ignores callForScreen and pause', () => {
    const input = make();
    input.press('callForScreen');
    input.press('pause');
    expect(input.actionsFor(start()).map((a) => a.type)).toEqual(['move', 'sprint', 'pivot']);
  });
});
