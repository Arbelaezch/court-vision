// Scripted offensive possession for the ?dev=sim scene: dribble, bounce pass, cut, lob back, jump
// shot. Recorded headlessly once, then played back by simPlayback.

import { loadSimMovement, loadSimPassing, loadSimShooting } from '../content';
import { createGame, recordHeadless } from '../sim';
import type { GameState, PlayerCommand, SimCommandInput, SimInput } from '../sim';

export const DEV_TIMELINE_SEED = 1;
/** 8 s at 60 Hz. */
export const DEV_TIMELINE_TICKS = 480;

const PASS_TICK = 60;
const CUT_START_TICK = 75;
const CUT_STOP_TICK = 135;
const LOB_TICK = 170;
const SHOOT_TICK = 245;

export function recordDevTimeline(): GameState[] {
  const movement = loadSimMovement();
  const passing = loadSimPassing();
  const shooting = loadSimShooting();
  const probe = createGame({
    seed: DEV_TIMELINE_SEED,
    movement,
    passing,
    shooting,
    defenseMode: 'cones',
  });
  const pg = probe.controlledPlayerId;
  const idOf = (role: string): number | undefined =>
    probe.players.find((p) => p.role === role && p.side === 'offense')?.id;
  const sg = idOf('SG');
  const sf = idOf('SF');
  const pf = idOf('PF');
  const c = idOf('C');
  if (sg === undefined || sf === undefined || pf === undefined || c === undefined) {
    throw new Error('Court Vision: dev timeline needs SG, SF, PF and C on offense');
  }

  const inputs: SimInput[] = [
    { tick: 0, action: { type: 'move', x: 0.7, z: -0.2 } },
    { tick: PASS_TICK, action: { type: 'pass', passType: 'bouncePass', targetId: sg } },
    { tick: PASS_TICK + 1, action: { type: 'move', x: 0, z: 0 } },
    { tick: CUT_START_TICK, action: { type: 'sprint', held: true } },
    { tick: CUT_START_TICK, action: { type: 'move', x: -0.8, z: -0.3 } },
    { tick: CUT_STOP_TICK, action: { type: 'move', x: 0, z: 0 } },
    { tick: CUT_STOP_TICK, action: { type: 'sprint', held: false } },
    { tick: SHOOT_TICK, action: { type: 'shoot' } },
  ];

  const steer = (tick: number, playerId: number, x: number, z: number): SimCommandInput => ({
    tick,
    command: { type: 'steer', playerId, x, z },
  });
  const lob: PlayerCommand = { type: 'pass', playerId: sg, passType: 'lob', targetId: pg };
  const commands: SimCommandInput[] = [
    steer(10, sf, -0.5, 0.4),
    steer(10, pf, 0.5, 0.3),
    steer(10, c, 0.3, 0),
    steer(20, sg, 0.2, 0.3),
    steer(40, sg, 0, 0),
    steer(50, sf, 0.5, -0.4),
    steer(50, pf, -0.5, -0.3),
    steer(50, c, -0.3, 0),
    steer(100, sf, 0, 0),
    steer(100, pf, 0, 0),
    steer(100, c, 0, 0),
    steer(PASS_TICK + 20, sg, 0, 0),
    { tick: LOB_TICK, command: lob },
  ];
  commands.sort((a, b) => a.tick - b.tick);

  return recordHeadless({
    seed: DEV_TIMELINE_SEED,
    ticks: DEV_TIMELINE_TICKS,
    inputs,
    commands,
    movement,
    passing,
    shooting,
    defenseMode: 'cones',
  });
}
