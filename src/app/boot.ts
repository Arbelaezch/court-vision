// Content boot: loads all bundled content and builds the app flow. No DOM, no default store.
import {
  checkPhaseConcepts,
  loadCastContent,
  loadGlossary,
  loadMasteryTuning,
  loadModes,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
} from '../content';
import { createAppFlow, type AppContent, type AppFlow, type AppFlowOptions } from './appFlow';

export function loadAppContent(): AppContent {
  const roles = loadCastContent().roles;
  const plays = loadPlaybook(roles);
  const glossary = loadGlossary();
  checkPhaseConcepts(plays, glossary);
  return {
    plays,
    glossary,
    modes: loadModes(),
    mastery: loadMasteryTuning(),
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
  };
}

export function bootApp(options: Omit<AppFlowOptions, 'content'>): AppFlow {
  return createAppFlow({ ...options, content: loadAppContent() });
}
