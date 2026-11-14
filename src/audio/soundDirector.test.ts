import { describe, expect, it } from 'vitest';
import { loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import { FIXED_DT, SIM_HZ, createGame } from '../sim';
import { ANIM_CLIP_PERIOD_S } from '../render/animation';
import type { BallState, GameEvent, GameState, PassType } from '../sim';
import { shotArcFromStep } from '../render/simInterpolation';
import { VOICES } from './sounds';
import type { SoundId } from './eventSounds';
import {
  FOOTSTEP_INTERVAL_TICKS,
  createSoundDirector,
  type SoundCue,
  type SoundStep,
} from './soundDirector';

function newGame(): GameState {
  return createGame({
    seed: 1,
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
    defenseMode: 'cones',
  });
}

type ShotResolvedEvent = Extract<GameEvent, { type: 'shotResolved' }>;

const BASE = newGame();

function at(tick: number, patch: Partial<GameState> = {}): GameState {
  return { ...BASE, tick, ...patch };
}

function inFlight(passType: PassType): BallState {
  return {
    kind: 'inFlight',
    pos: { x: 0, y: 1, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    fromId: 0,
    targetId: 1,
    passType,
    origin: { x: 0, y: 1, z: 0 },
    elapsedTicks: 0,
    flightTicks: 20,
    interception: null,
  };
}

function withSprint(game: GameState, id: number, sprinting: boolean): GameState {
  return {
    ...game,
    players: game.players.map((p) => (p.id === id ? { ...p, sprinting } : p)),
  };
}

function withVel(game: GameState, id: number, x: number, z: number): GameState {
  return {
    ...game,
    players: game.players.map((p) => (p.id === id ? { ...p, vel: { x, z } } : p)),
  };
}

function step(game: GameState, events: GameEvent[] = [], reset = false): SoundStep {
  return { game, events, reset };
}

function shot(overrides: Partial<ShotResolvedEvent> = {}): ShotResolvedEvent {
  return {
    type: 'shotResolved',
    tick: 10,
    shooterId: 0,
    shotType: 'jumper',
    zone: 'midRange',
    look: 'good',
    makeChance: 0.5,
    made: true,
    blockerId: null,
    reason: 'test',
    ...overrides,
  };
}

const sounds = (cues: SoundCue[]): SoundId[] => cues.map((c) => c.sound);

// A director that already saw a first step at tick 1 (held ball, nobody sprinting).
function primed() {
  const d = createSoundDirector();
  d.observe(step(at(1, { ball: { kind: 'held', holderId: 0 } })));
  return d;
}

const held: BallState = { kind: 'held', holderId: 0 };

describe('sound director', () => {
  // One row per sound; the coverage test below checks the table against VOICES.
  const table: [SoundId, () => SoundCue[]][] = [
    [
      'dribble',
      () => {
        const d = createSoundDirector();
        d.observe(step(at(1, { ball: held })));
        // Bounce index crosses between tick 1 and tick 60 (period well under a second).
        return d.observe(step(at(60, { ball: held })));
      },
    ],
    [
      'passChest',
      () => {
        const d = primed();
        return d.observe(step(at(2, { ball: inFlight('chestPass') })));
      },
    ],
    [
      'passBounce',
      () => {
        const d = primed();
        return d.observe(step(at(2, { ball: inFlight('bouncePass') })));
      },
    ],
    [
      'passLob',
      () => {
        const d = primed();
        return d.observe(step(at(2, { ball: inFlight('lob') })));
      },
    ],
    [
      'catch',
      () =>
        primed().observe(
          step(at(2, { ball: held }), [
            {
              type: 'passCompleted',
              tick: 2,
              passType: 'chestPass',
              passerId: 0,
              receiverId: 1,
              receiverSet: true,
            },
          ]),
        ),
    ],
    ['shotRelease', () => primed().observe(step(at(2, { ball: held }), [shot()]))],
    ['swish', () => primed().observe(step(at(2, { ball: held }), [shot({ made: true })]))],
    ['rimHit', () => primed().observe(step(at(2, { ball: held }), [shot({ made: false })]))],
    [
      'screenContact',
      () =>
        primed().observe(
          step(at(2, { ball: held }), [{ type: 'screenSet', tick: 2, screenerId: 4, targetId: 0 }]),
        ),
    ],
    [
      'footstep',
      () => {
        const d = primed();
        return d.observe(step(sprintingAt(2)));
      },
    ],
    [
      'whistle',
      () =>
        primed().observe(
          step(at(2, { ball: held }), [
            { type: 'mistake', tick: 2, kind: 'turnover', reason: 'x' },
          ]),
        ),
    ],
    [
      'chime',
      () =>
        primed().observe(
          step(at(2, { ball: held }), [{ type: 'runSuccess', tick: 2, grade: 'good' }]),
        ),
    ],
  ];

  function sprintingAt(tick: number): GameState {
    return withVel(
      withSprint(at(tick, { ball: held }), BASE.controlledPlayerId, true),
      BASE.controlledPlayerId,
      0,
      5,
    );
  }

  // The exact cue list each row must produce: no extra or duplicate cues.
  const expected: Record<string, SoundId[]> = {
    dribble: ['dribble'],
    passChest: ['passChest'],
    passBounce: ['passBounce'],
    passLob: ['passLob'],
    catch: ['catch'],
    shotRelease: ['shotRelease', 'swish'],
    swish: ['shotRelease', 'swish'],
    rimHit: ['shotRelease', 'rimHit'],
    screenContact: ['screenContact'],
    footstep: ['footstep'],
    whistle: ['whistle'],
    chime: ['chime'],
  };

  it.each(table)('plays %s', (sound, build) => {
    const cues = sounds(build());
    expect(cues).toContain(sound);
    expect(cues).toEqual(expected[sound]);
  });

  it('plays exactly one dribble per bounce period, on the tick the bounce index rises', () => {
    const d = createSoundDirector();
    const bounce = (tick: number) =>
      Math.floor((tick * FIXED_DT) / ANIM_CLIP_PERIOD_S.dribble + 0.5);
    const last = Math.ceil((2.5 * ANIM_CLIP_PERIOD_S.dribble) / FIXED_DT);
    d.observe(step(at(1, { ball: held })));
    const played: number[] = [];
    const expectedTicks: number[] = [];
    for (let t = 2; t <= last; t++) {
      if (sounds(d.observe(step(at(t, { ball: held })))).join() === 'dribble') played.push(t);
      if (bounce(t) > bounce(t - 1)) expectedTicks.push(t);
    }
    expect(expectedTicks.length).toBeGreaterThanOrEqual(2);
    expect(played).toEqual(expectedTicks);
  });

  it('covers every voice (the table plus uiClick)', () => {
    const covered = new Set<string>([...table.map(([s]) => s), 'uiClick']);
    expect([...covered].sort()).toEqual(Object.keys(VOICES).sort());
  });

  it('plays the release flick and a delayed swish for a made shot', () => {
    const d = primed();
    const prev = at(1, { ball: held });
    const curr = at(2, { ball: held });
    const ev = shot({ made: true });
    const cues = d.observe(step(curr, [ev]));
    const flight = shotArcFromStep(prev, curr, ev)!.flightTicks;
    expect(cues).toEqual([
      { sound: 'shotRelease', delayS: 0 },
      { sound: 'swish', delayS: flight / SIM_HZ },
    ]);
    expect(cues[1]!.delayS).toBeGreaterThan(0);
  });

  it('plays a delayed rim hit for a missed shot', () => {
    const cues = primed().observe(step(at(2, { ball: held }), [shot({ made: false })]));
    expect(sounds(cues)).toEqual(['shotRelease', 'rimHit']);
    expect(cues[1]!.delayS).toBeGreaterThan(0);
  });

  it('plays only the release flick for a blocked shot', () => {
    const cues = primed().observe(
      step(at(2, { ball: held }), [shot({ made: false, blockerId: 5 })]),
    );
    expect(sounds(cues)).toEqual(['shotRelease']);
  });

  it('plays nothing for an unsuccessful run', () => {
    const cues = primed().observe(
      step(at(2, { ball: held }), [{ type: 'runUnsuccessful', tick: 2, reason: 'Bad look' }]),
    );
    expect(cues).toEqual([]);
  });

  it('plays a footstep on the first sprinting step and every interval after, not between', () => {
    const d = primed();
    const played: number[] = [];
    for (let i = 0; i <= FOOTSTEP_INTERVAL_TICKS + 1; i++) {
      // Hold the ball so only footsteps (never dribble) are possible in this short window.
      const cues = d.observe(step(sprintingAt(2 + i)));
      if (sounds(cues).includes('footstep')) played.push(i);
    }
    expect(played).toEqual([0, FOOTSTEP_INTERVAL_TICKS]);
  });

  it('plays no footsteps for a sprinting player who is not controlled', () => {
    const other = BASE.players.find((p) => p.id !== BASE.controlledPlayerId)!.id;
    const d = primed();
    for (let i = 0; i < 5; i++) {
      const g = withVel(withSprint(at(2 + i, { ball: held }), other, true), other, 0, 5);
      expect(sounds(d.observe(step(g)))).not.toContain('footstep');
    }
  });

  it('plays no snapshot sounds on a reset step', () => {
    const d = primed();
    const cues = d.observe(step(sprintingAt(2), [], true));
    expect(cues).toEqual([]);
    const pass = createSoundDirector();
    pass.observe(step(at(1, { ball: held })));
    expect(pass.observe(step(at(2, { ball: inFlight('lob') }), [], true))).toEqual([]);
  });

  it('plays no snapshot sounds when the tick does not advance', () => {
    const d = primed();
    expect(d.observe(step(at(1, { ball: inFlight('chestPass') })))).toEqual([]);
  });

  it('treats a changed player set as a new game', () => {
    const d = primed();
    const fewer = at(2, { ball: inFlight('chestPass'), players: BASE.players.slice(1) });
    expect(d.observe(step(fewer))).toEqual([]);
  });

  it('still maps events on the first step', () => {
    const d = createSoundDirector();
    const cues = d.observe(
      step(at(1, { ball: held }), [{ type: 'runSuccess', tick: 1, grade: 'good' }]),
    );
    expect(sounds(cues)).toEqual(['chime']);
  });

  it('reset() forgets the previous game', () => {
    const d = primed();
    d.reset();
    expect(d.observe(step(at(2, { ball: inFlight('lob') })))).toEqual([]);
  });
});
