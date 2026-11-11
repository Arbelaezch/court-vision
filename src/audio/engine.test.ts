import { describe, it, expect, vi, afterEach } from 'vitest';
import type { GameEvent } from '../sim';
import { createAudioEngine, DEFAULT_VOLUMES } from './engine';
import {
  createFakeAudioContext,
  pathReaches,
  type FakeAudioContext,
  type FakeGain,
  type FakeOscillator,
} from './fakeAudioContext';

const mistake = (kind: 'wrongTeammate' | 'offScript' | 'turnover'): GameEvent => ({
  type: 'mistake',
  tick: 0,
  kind,
  reason: kind,
});

function setup(opts: Parameters<typeof createFakeAudioContext>[0] = {}, volumes?: object) {
  const ctx = createFakeAudioContext(opts);
  const createContext = vi.fn(() => ctx);
  const engine = createAudioEngine({ createContext, volumes });
  return { ctx, createContext, engine };
}

const gains = (ctx: FakeAudioContext) => ctx.nodes.filter((n): n is FakeGain => n.kind === 'gain');
const oscs = (ctx: FakeAudioContext) =>
  ctx.nodes.filter((n): n is FakeOscillator => n.kind === 'oscillator');

function first<T>(a: T[]): T {
  const v = a[0];
  if (v === undefined) throw new Error('expected at least one element');
  return v;
}

function three(ctx: FakeAudioContext): [FakeGain, FakeGain, FakeGain] {
  const g = gains(ctx);
  return [first(g), first(g.slice(1)), first(g.slice(2))];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('audio engine', () => {
  it('never creates a context before unlock', () => {
    const { createContext, engine } = setup();
    engine.setVolume('sfx', 0.5);
    engine.play('whistle');
    expect(() => engine.handleEvent(mistake('wrongTeammate'))).not.toThrow();
    expect(createContext).not.toHaveBeenCalled();
    expect(engine.isStarted()).toBe(false);
  });

  it('unlock creates one context with master->destination, sfx/music->master', () => {
    const { ctx, createContext, engine } = setup();
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    const [master, sfx, music] = three(ctx);
    expect(gains(ctx)).toHaveLength(3);
    expect(master.connections).toContain(ctx.destination);
    expect(sfx.connections).toContain(master);
    expect(music.connections).toContain(master);
    expect(master.gain.value).toBe(DEFAULT_VOLUMES.master);
    expect(sfx.gain.value).toBe(DEFAULT_VOLUMES.sfx);
    expect(music.gain.value).toBe(DEFAULT_VOLUMES.music);
  });

  it('uses the volumes option', () => {
    const { ctx, engine } = setup({}, { master: 0.5, music: 0.1 });
    engine.unlock();
    const [master, sfx, music] = three(ctx);
    expect([master.gain.value, sfx.gain.value, music.gain.value]).toEqual([0.5, 1, 0.1]);
  });

  it('second unlock does not create another context; resumes while suspended', () => {
    const { createContext, engine } = setup();
    engine.unlock();
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);

    const s = setup({ state: 'suspended' });
    s.ctx.resume = vi.fn(() => Promise.resolve());
    s.engine.unlock();
    s.engine.unlock();
    expect(s.ctx.resume).toHaveBeenCalledTimes(2);
    expect(s.createContext).toHaveBeenCalledTimes(1);
  });

  it('applies volumes set before unlock and updates after', () => {
    const { ctx, engine } = setup();
    engine.setVolume('music', 0.2);
    engine.unlock();
    const [master, sfx, music] = three(ctx);
    expect(music.gain.value).toBe(0.2);
    engine.setVolume('sfx', 0.3);
    engine.setVolume('master', 0.4);
    expect(sfx.gain.value).toBe(0.3);
    expect(master.gain.value).toBe(0.4);
    expect(engine.getVolume('sfx')).toBe(0.3);
  });

  it.each([NaN, -0.1, 1.5])('rejects invalid volume %s', (v) => {
    const { engine } = setup();
    expect(() => engine.setVolume('sfx', v)).toThrow(/^Court Vision:/);
  });

  it('starts the whistle synchronously at currentTime through sfx', () => {
    const { ctx, engine } = setup({ currentTime: 12.5 });
    engine.unlock();
    const [master, sfx] = three(ctx);
    const before = oscs(ctx).length;
    engine.handleEvent(mistake('wrongTeammate'));
    const fresh = oscs(ctx).slice(before);
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh.some((o) => o.startedAt === 12.5)).toBe(true);
    for (const o of fresh) expect(pathReaches(o, sfx)).toBe(true);
    expect(pathReaches(sfx, ctx.destination)).toBe(true);
    expect(pathReaches(sfx, master)).toBe(true);
  });

  it.each(['wrongTeammate', 'offScript', 'turnover'] as const)('%s starts the whistle', (kind) => {
    const { ctx, engine } = setup({ currentTime: 3 });
    engine.unlock();
    engine.handleEvent(mistake(kind));
    const osc = first(oscs(ctx));
    expect(oscs(ctx)).toHaveLength(1);
    expect(osc.type).toBe('triangle');
    expect(osc.startedAt).toBe(3);
  });

  it.each(['sfx', 'master'] as const)('silences when %s volume is 0', (bus) => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.setVolume(bus, 0);
    const node = three(ctx)[bus === 'master' ? 0 : 1];
    expect(node.gain.value).toBe(0);
    engine.handleEvent(mistake('turnover'));
    expect(oscs(ctx)).toHaveLength(0);
  });

  it('runSuccess plays a 2-note chime; runUnsuccessful creates no nodes', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    const baseline = ctx.nodes.length;
    engine.handleEvent({ type: 'runUnsuccessful', tick: 0, reason: 'Bad look' });
    expect(ctx.nodes).toHaveLength(baseline);
    engine.handleEvent({ type: 'runSuccess', tick: 0, grade: 'perfect' });
    expect(oscs(ctx)).toHaveLength(2);
  });

  it('whistle envelope starts and ends at 0 and the oscillator stops after start', () => {
    const { ctx, engine } = setup({ currentTime: 1 });
    engine.unlock();
    engine.play('whistle');
    const osc = first(oscs(ctx));
    const env = first(gains(ctx).slice(3));
    const auto = env.gain.automation;
    expect(first(auto).value).toBe(0);
    expect(first(auto.slice(-1)).value).toBe(0);
    expect(osc.stoppedAt!).toBeGreaterThan(osc.startedAt!);
  });

  it('warns once and stays silent when createContext throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const createContext = vi.fn(() => {
      throw new Error('no audio');
    });
    const engine = createAudioEngine({ createContext });
    expect(() => engine.unlock()).not.toThrow();
    engine.unlock();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(() => engine.play('whistle')).not.toThrow();
    expect(engine.isStarted()).toBe(false);
  });

  it('drops sounds while the context is suspended instead of queueing them', () => {
    const { ctx, engine } = setup({ state: 'suspended' });
    ctx.resume = () => Promise.resolve();
    engine.unlock();
    expect(ctx.state).toBe('suspended');
    engine.handleEvent(mistake('wrongTeammate'));
    expect(oscs(ctx)).toHaveLength(0);
    ctx.state = 'running';
    engine.handleEvent(mistake('wrongTeammate'));
    expect(oscs(ctx).length).toBeGreaterThan(0);
  });

  it('dispose closes once and disables play and unlock', () => {
    const { ctx, createContext, engine } = setup();
    engine.unlock();
    engine.dispose();
    engine.dispose();
    expect(ctx.closeCalls).toBe(1);
    const n = ctx.nodes.length;
    engine.play('whistle');
    expect(ctx.nodes).toHaveLength(n);
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});
