import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../sim';
import { recordDevTimeline } from './devTimeline';
import { SIM_PLAYBACK_LOOP_HOLD_S, createSimPlayback } from './simPlayback';
import type { SimFrame } from './simPlayback';
import { ballRenderPosition, interpolatePlayers } from './simInterpolation';
import type { SimSnapshot } from './simInterpolation';

const states = recordDevTimeline();
const last = states.length - 1;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

interface Sample {
  frame: SimFrame;
  positions: Map<number, { x: number; z: number }>;
  ball: { x: number; y: number; z: number };
}

/** One pass through the timeline (no loop restart) at a fixed frame rate. */
function runFrames(hz: number): Sample[] {
  const playback = createSimPlayback(states);
  const dt = 1 / hz;
  const samples: Sample[] = [];
  const frames = Math.ceil((last / SIM_HZ) * hz) + 2;
  for (let i = 0; i < frames; i++) {
    const frame = playback.advance(dt);
    const poses = interpolatePlayers(frame.prev, frame.curr, frame.alpha, (p) =>
      playback.tracker.animFor(p, frame.curr),
    );
    const ball = ballRenderPosition(
      frame.prev,
      frame.curr,
      frame.alpha,
      poses,
      playback.tracker.shotArc(),
    );
    samples.push({
      frame,
      positions: new Map(poses.map((p) => [p.id, { x: p.pos.x, z: p.pos.z }])),
      ball,
    });
  }
  return samples;
}

function maxTickDisplacement(): number {
  let max = 0;
  for (let k = 1; k <= last; k++) {
    for (const p of states[k]!.players) {
      const before = states[k - 1]!.players.find((q) => q.id === p.id)!;
      max = Math.max(max, Math.hypot(p.pos.x - before.pos.x, p.pos.z - before.pos.z));
    }
  }
  return max;
}

/** Physical cap on rendered ball speed, m/s. */
const BALL_MAX_SPEED_MPS = 40;
/** Extra speed a held ball may have relative to its holder, m/s (dribble bounce and offset easing). */
const HELD_EXTRA_SPEED_MPS = 8;

describe('createSimPlayback', () => {
  it('needs at least two states', () => {
    expect(() => createSimPlayback([states[0]!])).toThrow(
      'Court Vision: sim playback needs at least two states',
    );
  });

  it.each([60, 90, 144])('moves smoothly at %i Hz', (hz) => {
    const dt = 1 / hz;
    const samples = runFrames(hz);
    const maxPlayer = maxTickDisplacement() * dt * SIM_HZ + 1e-9;
    // Independent physical cap on rendered ball travel per frame, not derived from the output.
    const maxBall = BALL_MAX_SPEED_MPS * dt;
    for (let i = 1; i < samples.length; i++) {
      for (const [id, pos] of samples[i]!.positions) {
        const before = samples[i - 1]!.positions.get(id)!;
        expect(Math.hypot(pos.x - before.x, pos.z - before.z)).toBeLessThanOrEqual(maxPlayer);
      }
      const a = samples[i - 1]!.ball;
      const b = samples[i]!.ball;
      const step = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const f = samples[i]!.frame;
      const g = samples[i - 1]!.frame;
      // The sim moves the ball between hand and flight within one tick (release and catch), so
      // frames at or just after such a step are exempt from the speed cap.
      const handoff = [f, g].some((x) => x.prev.ball.kind !== x.curr.ball.kind);
      if (!handoff) expect(step).toBeLessThanOrEqual(maxBall);
      if (
        f.prev.ball.kind === 'held' &&
        f.curr.ball.kind === 'held' &&
        g.prev.ball.kind === 'held' &&
        g.curr.ball.kind === 'held'
      ) {
        // A held ball only follows its holder plus the dribble bounce (peak 4.8 m/s) and the
        // hold-offset easing, so a catch or release must not pop its height.
        expect(step).toBeLessThanOrEqual(maxPlayer + HELD_EXTRA_SPEED_MPS * dt);
      }
    }
  });

  it('interpolates between ticks at 144 Hz', () => {
    const samples = runFrames(144);
    const found = samples.some(({ frame, positions }) => {
      if (!(frame.alpha > 0 && frame.alpha < 1)) return false;
      return frame.curr.players.some((p) => {
        const before = frame.prev.players.find((q) => q.id === p.id)!;
        const pos = positions.get(p.id)!;
        const differs = (q: { x: number; z: number }): boolean =>
          Math.abs(q.x - pos.x) > 1e-9 || Math.abs(q.z - pos.z) > 1e-9;
        return differs(p.pos) && differs(before.pos);
      });
    });
    expect(found).toBe(true);
  });

  it('observes every step in one long frame, including the bounce-pass release', () => {
    const release = states.findIndex((s, i) => i > 0 && s.ball.kind === 'inFlight');
    const pg = states[0]!.controlledPlayerId;
    const playback = createSimPlayback(states);
    // 15 steps per frame; stop one frame after the release.
    let frame = playback.advance(0.25);
    while (frame.curr.tick < release + 2) frame = playback.advance(0.25);
    expect(frame.curr.tick).toBeLessThan(release + 20);
    const player = frame.curr.players.find((p) => p.id === pg)!;
    expect(playback.tracker.animFor(player, frame.curr)).toBe('pass');
  });

  it('loops and resets after the hold', () => {
    const playback = createSimPlayback(states);
    const dt = 1 / SIM_HZ;
    const total = last + Math.round(SIM_PLAYBACK_LOOP_HOLD_S * SIM_HZ);
    let frame = playback.advance(dt);
    for (let i = 1; i < last; i++) frame = playback.advance(dt);
    expect(frame.curr.tick).toBe(last);
    expect(frame.alpha).toBe(0);
    for (let i = last; i < total - 1; i++) frame = playback.advance(dt);
    expect(frame.curr.tick).toBe(last);
    frame = playback.advance(dt);
    expect(frame.curr.tick).toBe(0);
    expect(frame.prev.tick).toBe(0);
  });

  it('holds on the last state without loop', () => {
    const playback = createSimPlayback(states, { loop: false });
    let frame = playback.advance(0);
    for (let i = 0; i < last + 300; i++) frame = playback.advance(1 / SIM_HZ);
    expect(frame.curr.tick).toBe(last);
    expect(frame.alpha).toBe(0);
  });

  it('speed 2 reaches the end in half the frames', () => {
    const frames = (speed: number): number => {
      const playback = createSimPlayback(states, { speed, loop: false });
      let n = 0;
      let frame = playback.advance(0);
      while (frame.curr.tick < last) {
        frame = playback.advance(1 / SIM_HZ);
        n++;
      }
      return n;
    };
    expect(frames(2)).toBe(Math.ceil(frames(1) / 2));
  });

  it('does not throw on deep-frozen states', () => {
    const frozen: SimSnapshot[] = deepFreeze(structuredClone(states));
    const playback = createSimPlayback(frozen);
    expect(() => {
      for (let i = 0; i < 600; i++) {
        const frame = playback.advance(1 / 60);
        const poses = interpolatePlayers(frame.prev, frame.curr, frame.alpha, (p) =>
          playback.tracker.animFor(p, frame.curr),
        );
        ballRenderPosition(frame.prev, frame.curr, frame.alpha, poses, playback.tracker.shotArc());
      }
    }).not.toThrow();
  });
});
