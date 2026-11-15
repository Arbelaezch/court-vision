// First-time concept tooltips. DOM-free and timer-free: durations count sim steps, so they freeze
// while paused. Never touches the run clock, controller or input (tooltips must not block a run).
import { glossaryEntry, type Glossary, type GlossaryEntry, type PlayScenario } from '../content';
import { SIM_HZ } from '../sim';
import type { SaveStore } from './storage';

export interface ConceptTooltipTracker {
  /** Once per app frame. Returns the tooltips to show now, oldest first. */
  update(input: {
    readonly phaseId: string;
    readonly playing: boolean;
    readonly simSteps: number;
  }): readonly GlossaryEntry[];
}

interface ActiveTooltip {
  readonly entry: GlossaryEntry;
  remainingSeconds: number;
}

export function createConceptTooltipTracker(opts: {
  play: PlayScenario;
  glossary: Glossary;
  store: Pick<SaveStore, 'get' | 'set'>;
}): ConceptTooltipTracker {
  const { play, glossary, store } = opts;
  let active: ActiveTooltip[] = [];
  let lastCheckedPhaseId: string | null = null;

  return {
    update({ phaseId, playing, simSteps }) {
      const elapsed = simSteps / SIM_HZ;
      if (elapsed > 0) {
        for (const a of active) a.remainingSeconds -= elapsed;
        active = active.filter((a) => a.remainingSeconds > 0);
      }
      if (playing && phaseId !== lastCheckedPhaseId) {
        lastCheckedPhaseId = phaseId;
        const phase = play.phases.find((p) => p.id === phaseId);
        if (phase !== undefined) {
          const seen = store.get('seenTooltips');
          const newIds: string[] = [];
          for (const id of phase.concepts) {
            if (seen.includes(id) || newIds.includes(id)) continue;
            if (active.some((a) => a.entry.id === id)) continue;
            const entry = glossaryEntry(glossary, id);
            if (entry === undefined) continue;
            active.push({ entry, remainingSeconds: glossary.tooltipSeconds });
            newIds.push(id);
          }
          if (newIds.length > 0) store.set('seenTooltips', [...seen, ...newIds]);
        }
      }
      return active.map((a) => a.entry);
    },
  };
}
