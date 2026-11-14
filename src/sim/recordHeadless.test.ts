import { describe, expect, it } from 'vitest';
import { recordHeadless, runHeadless } from './index';
import type { HeadlessRunOptions, SimCommandInput, SimInput } from './index';
import { TEST_MOVEMENT } from './testMovement';
import { TEST_PASSING } from './testPassing';
import { TEST_SHOOTING } from './testShooting';

const base: HeadlessRunOptions = {
  seed: 7,
  ticks: 200,
  inputs: [{ tick: 0, action: { type: 'pass', passType: 'chestPass', targetId: 1 } }],
  movement: TEST_MOVEMENT,
  passing: TEST_PASSING,
  shooting: TEST_SHOOTING,
  commands: [
    { tick: 0, command: { type: 'steer', playerId: 2, x: 1, z: 0 } },
    { tick: 120, command: { type: 'pass', playerId: 1, passType: 'chestPass', targetId: 0 } },
  ],
};

describe('recordHeadless', () => {
  it('returns ticks + 1 states with matching tick numbers', () => {
    const states = recordHeadless(base);
    expect(states).toHaveLength(201);
    states.forEach((s, k) => expect(s.tick).toBe(k));
  });

  it('ends with the same state as runHeadless', () => {
    const states = recordHeadless(base);
    expect(states[states.length - 1]).toStrictEqual(runHeadless(base));
  });

  it('moves a non-controlled player with a steer command', () => {
    const states = recordHeadless(base);
    const start = states[0]!.players.find((p) => p.id === 2)!.pos;
    const end = states[60]!.players.find((p) => p.id === 2)!.pos;
    expect(end.x).toBeGreaterThan(start.x + 0.5);
  });

  it('completes a pass commanded from a teammate holder', () => {
    const states = recordHeadless(base);
    const completed = states.flatMap((s) => s.events).filter((e) => e.type === 'passCompleted');
    expect(completed.map((e) => [e.passerId, e.receiverId])).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it('throws for unsorted command ticks', () => {
    const commands: SimCommandInput[] = [
      { tick: 5, command: { type: 'steer', playerId: 1, x: 1, z: 0 } },
      { tick: 2, command: { type: 'steer', playerId: 1, x: 0, z: 0 } },
    ];
    expect(() => recordHeadless({ ...base, inputs: [], commands })).toThrow(
      /^Court Vision: commands must be sorted/,
    );
  });

  it.each([200, -1, 2.5])('throws for command tick %s', (tick) => {
    const commands: SimCommandInput[] = [
      { tick, command: { type: 'steer', playerId: 1, x: 1, z: 0 } },
    ];
    expect(() => recordHeadless({ ...base, inputs: [], commands })).toThrow(
      /^Court Vision: command tick must be/,
    );
  });

  it('passes defenseMode through to the game', () => {
    const inputs: SimInput[] = [];
    const states = recordHeadless({
      ...base,
      inputs,
      commands: [],
      ticks: 2,
      defenseMode: 'cones',
    });
    expect(states[0]!.defenseMode).toBe('cones');
    expect(states[2]!.defenseMode).toBe('cones');
  });

  it('records distinct state objects', () => {
    const states = recordHeadless({ ...base, ticks: 3, commands: [] });
    const before = structuredClone(states[2]);
    states[1]!.players[0]!.pos.x = 999;
    expect(states[2]).toStrictEqual(before);
  });
});
