import { describe, expect, it } from 'vitest';
import { loadSimShooting } from '../content';
import { RIM_CENTER } from '../sim';
import type { GameEvent } from '../sim';
import { DEV_TIMELINE_SEED, DEV_TIMELINE_TICKS, recordDevTimeline } from './devTimeline';

const states = recordDevTimeline();
const events: GameEvent[] = states.flatMap((s) => s.events);

describe('recordDevTimeline', () => {
  it('records every tick', () => {
    expect(DEV_TIMELINE_SEED).toBe(1);
    expect(states).toHaveLength(DEV_TIMELINE_TICKS + 1);
  });

  it('plays bounce pass, lob, then a jump shot by the PG', () => {
    const pg = states[0]!.controlledPlayerId;
    const sg = states[0]!.players.find((p) => p.role === 'SG' && p.side === 'offense')!.id;
    const relevant = events.filter((e) => e.type === 'passCompleted' || e.type === 'shotResolved');
    expect(relevant.map((e) => e.type)).toEqual(['passCompleted', 'passCompleted', 'shotResolved']);
    const [bounce, lob, shot] = relevant;
    expect(bounce).toMatchObject({ passType: 'bouncePass', passerId: pg, receiverId: sg });
    expect(lob).toMatchObject({ passType: 'lob', passerId: sg, receiverId: pg });
    expect(shot).toMatchObject({ type: 'shotResolved', shooterId: pg, blockerId: null });
    if (shot?.type !== 'shotResolved') throw new Error('expected shotResolved');
    expect(['layup', 'floater']).not.toContain(shot.shotType);
  });

  it('shoots from outside the rim zone', () => {
    const shotIndex = states.findIndex((s) => s.events.some((e) => e.type === 'shotResolved'));
    const pg = states[shotIndex - 1]!.players[0]!;
    const d = Math.hypot(pg.pos.x - RIM_CENTER.x, pg.pos.z - RIM_CENTER.z);
    expect(d).toBeGreaterThan(loadSimShooting().tuning.rimZoneRadiusM);
  });

  it('has the PG sprinting at some point', () => {
    const pg = states[0]!.controlledPlayerId;
    expect(states.some((s) => s.players.find((p) => p.id === pg)!.sprinting)).toBe(true);
  });

  it('moves every offense player', () => {
    for (const p of states[0]!.players.filter((q) => q.side === 'offense')) {
      const moved = states.some((s) => {
        const q = s.players.find((r) => r.id === p.id)!;
        return q.pos.x !== p.pos.x || q.pos.z !== p.pos.z;
      });
      expect(moved).toBe(true);
    }
  });

  it('leaves time after the shot and ends with a dead ball', () => {
    const shotIndex = states.findIndex((s) => s.events.some((e) => e.type === 'shotResolved'));
    expect(DEV_TIMELINE_TICKS - shotIndex).toBeGreaterThanOrEqual(90);
    expect(states[states.length - 1]!.ball.kind).toBe('dead');
  });

  it('is deterministic', () => {
    expect(recordDevTimeline()).toStrictEqual(states);
  });
});
