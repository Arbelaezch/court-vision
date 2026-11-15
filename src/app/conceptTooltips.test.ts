import { describe, expect, it, vi } from 'vitest';
import { loadGlossary, type PlayScenario } from '../content';
import { SIM_HZ } from '../sim';
import { loadAppContent } from './boot';
import { createConceptTooltipTracker } from './conceptTooltips';
import { createSaveStore } from './storage';
import { createFakeStorage } from './storage/fakeStorage';

const PLAY = loadAppContent().plays.giveAndGo as PlayScenario;
const GLOSSARY = loadGlossary();

function setup(storage = createFakeStorage()) {
  const store = createSaveStore({ storage, warn: vi.fn() });
  const tracker = createConceptTooltipTracker({ play: PLAY, glossary: GLOSSARY, store });
  return { storage, store, tracker };
}

const ids = (es: readonly { id: string }[]): string[] => es.map((e) => e.id);

describe('concept tooltip tracker', () => {
  it('shows and marks seen the concepts of the entered phase', () => {
    const { store, tracker } = setup();
    const shown = tracker.update({ phaseId: 'entry', playing: true, simSteps: 1 });
    expect(ids(shown)).toEqual(['positions', 'spacing']);
    expect(store.get('seenTooltips')).toEqual(expect.arrayContaining(['positions', 'spacing']));
  });

  it('shows nothing and writes nothing while not playing', () => {
    const { store, tracker } = setup();
    const set = vi.spyOn(store, 'set');
    expect(tracker.update({ phaseId: 'entry', playing: false, simSteps: 1 })).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it('expires after tooltipSeconds of sim time and freezes at zero steps', () => {
    const { tracker } = setup();
    tracker.update({ phaseId: 'entry', playing: true, simSteps: 0 });
    for (let i = 0; i < 50; i++) {
      expect(tracker.update({ phaseId: 'entry', playing: true, simSteps: 0 })).toHaveLength(2);
    }
    const total = GLOSSARY.tooltipSeconds * SIM_HZ;
    expect(tracker.update({ phaseId: 'entry', playing: true, simSteps: total - 1 })).toHaveLength(
      2,
    );
    expect(tracker.update({ phaseId: 'entry', playing: true, simSteps: 1 })).toEqual([]);
  });

  it('does not repeat after a reload on the same storage', () => {
    const first = setup();
    first.tracker.update({ phaseId: 'entry', playing: true, simSteps: 1 });
    const second = setup(first.storage);
    expect(second.tracker.update({ phaseId: 'entry', playing: true, simSteps: 1 })).toEqual([]);
    expect(ids(second.tracker.update({ phaseId: 'cut', playing: true, simSteps: 1 }))).toEqual([
      'cut',
    ]);
  });

  it('shows again after resetProgress', () => {
    const { store } = setup();
    const t1 = createConceptTooltipTracker({ play: PLAY, glossary: GLOSSARY, store });
    t1.update({ phaseId: 'entry', playing: true, simSteps: 1 });
    store.resetProgress();
    const t2 = createConceptTooltipTracker({ play: PLAY, glossary: GLOSSARY, store });
    expect(ids(t2.update({ phaseId: 'entry', playing: true, simSteps: 1 }))).toEqual([
      'positions',
      'spacing',
    ]);
  });

  it('writes once per phase entry, not once per frame', () => {
    const { store, tracker } = setup();
    const set = vi.spyOn(store, 'set');
    for (let i = 0; i < 10; i++) tracker.update({ phaseId: 'entry', playing: true, simSteps: 1 });
    expect(set).toHaveBeenCalledTimes(1);
    tracker.update({ phaseId: 'cut', playing: true, simSteps: 1 });
    expect(set).toHaveBeenCalledTimes(2);
  });
});
