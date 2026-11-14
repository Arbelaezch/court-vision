import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import { createGame } from '../sim';
import type { GameEvent } from '../sim';
import { createAudioEngine, DEFAULT_VOLUMES, MUSIC_FADE_S } from './engine';
import {
  createFakeAudioContext,
  pathReaches,
  type FakeAudioContext,
  type FakeBufferSource,
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

const bufferSources = (ctx: FakeAudioContext) =>
  ctx.nodes.filter((n): n is FakeBufferSource => n.kind === 'bufferSource');

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

  it('play(sound, delayS) schedules at currentTime + delayS', () => {
    const { ctx, engine } = setup({ currentTime: 4 });
    engine.unlock();
    engine.play('swish', 0.5);
    const src = bufferSources(ctx);
    expect(src).toHaveLength(1);
    expect(first(src).startedAt).toBe(4.5);
  });

  it('setSfxEnabled(false) silences play', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.setSfxEnabled(false);
    const n = ctx.nodes.length;
    engine.play('whistle');
    expect(ctx.nodes).toHaveLength(n);
    engine.setSfxEnabled(true);
    engine.play('whistle');
    expect(ctx.nodes.length).toBeGreaterThan(n);
  });

  it.each([-1, NaN, Infinity])('play rejects delay %s', (d) => {
    const { engine } = setup();
    expect(() => engine.play('whistle', d)).toThrow(/^Court Vision:/);
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

describe('music loop', () => {
  it('is silent when never enabled', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    expect(bufferSources(ctx)).toHaveLength(0);
    expect(engine.isMusicEnabled()).toBe(false);
    expect(engine.isMusicPlaying()).toBe(false);
  });

  it('enabled before unlock starts one looping source on the music bus at unlock', () => {
    const { ctx, engine } = setup({ currentTime: 7 });
    engine.setMusicEnabled(true);
    expect(bufferSources(ctx)).toHaveLength(0);
    engine.unlock();
    const [master, , music] = three(ctx);
    const srcs = bufferSources(ctx);
    expect(srcs).toHaveLength(1);
    const src = first(srcs);
    expect(src.loop).toBe(true);
    expect(src.startedAt).toBe(ctx.currentTime);
    expect(src.buffer).not.toBeNull();
    expect(pathReaches(src, music)).toBe(true);
    expect(pathReaches(src, master)).toBe(true);
    expect(pathReaches(src, ctx.destination)).toBe(true);
    expect(engine.isMusicPlaying()).toBe(true);
  });

  it('enabling after unlock starts the loop; disabling fades and stops it', () => {
    const { ctx, engine } = setup({ currentTime: 3 });
    engine.unlock();
    engine.setMusicEnabled(true);
    const src = first(bufferSources(ctx));
    expect(engine.isMusicPlaying()).toBe(true);
    const fade = first(src.connections as FakeGain[]);
    ctx.currentTime = 10;
    engine.setMusicEnabled(false);
    expect(src.stoppedAt).toBe(10 + MUSIC_FADE_S);
    expect(first(fade.gain.automation.slice(-1)).value).toBe(0);
    expect(engine.isMusicPlaying()).toBe(false);
    expect(engine.isMusicEnabled()).toBe(false);
  });

  it('enabling twice creates one source', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.setMusicEnabled(true);
    engine.setMusicEnabled(true);
    expect(bufferSources(ctx)).toHaveLength(1);
  });

  it('can restart after being disabled', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.setMusicEnabled(true);
    engine.setMusicEnabled(false);
    engine.setMusicEnabled(true);
    expect(bufferSources(ctx)).toHaveLength(2);
    expect(engine.isMusicPlaying()).toBe(true);
  });

  it('dispose stops a playing loop', () => {
    const { ctx, engine } = setup({ currentTime: 1 });
    engine.unlock();
    engine.setMusicEnabled(true);
    const src = first(bufferSources(ctx));
    engine.dispose();
    expect(src.stoppedAt).toBe(1 + MUSIC_FADE_S);
    expect(engine.isMusicPlaying()).toBe(false);
  });
});

describe('handleStep', () => {
  const baseGame = createGame({
    seed: 1,
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
    defenseMode: 'cones',
  });
  const heldGame = { ...baseGame, tick: 1, ball: { kind: 'held', holderId: 0 } } as const;
  const passGame = {
    ...baseGame,
    tick: 2,
    ball: {
      kind: 'inFlight',
      pos: { x: 0, y: 1, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      fromId: 0,
      targetId: 1,
      passType: 'chestPass',
      origin: { x: 0, y: 1, z: 0 },
      elapsedTicks: 0,
      flightTicks: 20,
      interception: null,
    },
  } as const;

  it('plays event cues through the engine', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.handleStep({ game: heldGame, events: [mistake('turnover')], reset: false });
    expect(oscs(ctx).length).toBeGreaterThan(0);
  });

  it('advances the director while locked, so a pass released while locked is not replayed', () => {
    const { ctx, engine } = setup();
    expect(() => engine.handleStep({ game: heldGame, events: [], reset: false })).not.toThrow();
    engine.handleStep({ game: passGame, events: [], reset: false });
    engine.unlock();
    expect(oscs(ctx)).toHaveLength(0);
    engine.handleStep({ game: { ...passGame, tick: 3 }, events: [], reset: false });
    expect(oscs(ctx)).toHaveLength(0);
  });

  it('plays a pass release sound from a held-to-flight transition', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.handleStep({ game: heldGame, events: [], reset: false });
    const before = ctx.nodes.length;
    engine.handleStep({ game: passGame, events: [], reset: false });
    expect(ctx.nodes.length).toBeGreaterThan(before);
  });
});
