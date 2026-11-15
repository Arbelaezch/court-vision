import { describe, expect, it } from 'vitest';
import { loadAppContent } from './boot';
import { createPlayPreviewSession } from './playPreviewSession';

const CONTENT = loadAppContent();
const PLAYS = Object.values(CONTENT.plays);

function make(reduced = false) {
  return createPlayPreviewSession({ content: CONTENT, reducedMotion: () => reduced });
}

describe('play preview session', () => {
  it.each(PLAYS.map((p) => [p.id, p] as const))('cycles every coverage of %s live', (_id, play) => {
    const session = make();
    session.select(play.id);
    const labels: string[] = [];
    for (let i = 0; i < 20000; i++) {
      const f = session.frame(250);
      if (f === null) throw new Error('no frame');
      expect(f.game.defenseMode).toBe('live');
      if (labels[labels.length - 1] !== f.coverageLabel) labels.push(f.coverageLabel);
      if (labels.length > play.coverages.length) break;
    }
    const names = play.coverages.map((c) => c.name);
    expect(labels).toEqual([...names, names[0]]);
  });

  it('throws on an unknown play and returns null before select', () => {
    const session = make();
    expect(session.frame(16)).toBeNull();
    expect(() => session.select('nope')).toThrow(/unknown play/);
  });

  it('does not restart when the same play is selected twice', () => {
    const session = make();
    const id = PLAYS[0]!.id;
    session.select(id);
    session.frame(2000);
    const before = session.frame(0);
    session.select(id);
    const after = session.frame(0);
    expect(after?.coverageIndex).toBe(before?.coverageIndex);
    expect(after?.game).toBe(before?.game);
  });

  it('starts the next frame with a reset step on the new play when switching', () => {
    const session = make();
    session.select(PLAYS[0]!.id);
    session.frame(500);
    const other = PLAYS[1]!;
    session.select(other.id);
    const f = session.frame(100);
    expect(f?.playId).toBe(other.id);
    expect(f?.steps[0]?.reset).toBe(true);
  });

  it('does not animate under reduced motion', () => {
    const session = make(true);
    const play = PLAYS[0]!;
    session.select(play.id);
    const first = session.frame(1000);
    expect(first?.steps).toHaveLength(1);
    expect(first?.steps[0]?.reset).toBe(true);
    expect(first?.coverageLabel).toBe(play.coverages[0]!.name);
    for (let i = 0; i < 50; i++) {
      const f = session.frame(1000);
      expect(f?.steps).toHaveLength(0);
      expect(f?.game).toBe(first?.game);
    }
  });

  it('stop clears the selection', () => {
    const session = make();
    session.select(PLAYS[0]!.id);
    session.stop();
    expect(session.current()).toBeNull();
    expect(session.frame(16)).toBeNull();
  });
});
