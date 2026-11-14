// Content boot: loads all bundled content and builds the app flow. No DOM, no default store.
import {
  loadCastContent,
  loadModes,
  loadPlaybook,
  loadSimMovement,
  loadSimPassing,
  loadSimShooting,
} from '../content';
import { createAppFlow, type AppContent, type AppFlow, type AppFlowOptions } from './appFlow';

export function loadAppContent(): AppContent {
  const roles = loadCastContent().roles;
  return {
    plays: loadPlaybook(roles),
    modes: loadModes(),
    movement: loadSimMovement(),
    passing: loadSimPassing(),
    shooting: loadSimShooting(),
  };
}

export function bootApp(options: Omit<AppFlowOptions, 'content'>): AppFlow {
  return createAppFlow({ ...options, content: loadAppContent() });
}
