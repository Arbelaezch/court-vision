import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunControllerState } from '../../src/ai';
import { bootApp, createSaveStore } from '../../src/app';
import { createFakeStorage } from '../../src/app/storage/fakeStorage';
import { BUNDLED_PLAY_SOURCES } from '../../src/content';

// Release smoke: every bundled play reaches a Practice run and a Scrimmage run
// headless (fake storage, stub renderer, fixed seed) with no console errors or warnings.

const MODES = ['practice', 'scrimmage'] as const;
const PLAY_IDS = BUNDLED_PLAY_SOURCES.map((source) => basename(source.file, '.ts'));
const CASES = MODES.flatMap((mode) => PLAY_IDS.map((playId) => ({ mode, playId })));

describe('release runs smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
    warnSpy = vi.spyOn(console, 'warn');
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it.each(CASES)('reaches a $mode run of $playId without console errors', ({ mode, playId }) => {
    const store = createSaveStore({ storage: createFakeStorage({}), warn: () => {} });
    const drawn: RunControllerState[] = [];
    const flow = bootApp({
      store,
      renderer: { drawRun: (c) => drawn.push(c), clear: () => {} },
      seed: () => 1,
      visibility: { target: new EventTarget(), isHidden: () => false },
    });

    expect(flow.labels().plays.map((p) => p.id)).toContain(playId);
    expect(flow.send({ type: mode === 'practice' ? 'openPractice' : 'openScrimmage' }).ok).toBe(
      true,
    );
    expect(flow.send({ type: 'selectPlay', playId }).ok).toBe(true);
    expect(flow.state()).toEqual({ screen: 'inRun', modeId: mode, playId });

    for (let i = 0; i < 60; i++) flow.frame(1000 / 60);
    const last = drawn[drawn.length - 1];
    expect(last?.playId).toBe(playId);
    expect(last?.mode.id).toBe(mode);
    expect(last?.status).not.toBe('quit');

    flow.handleAction('pause');
    flow.send({ type: 'quit' });
    expect(flow.state().screen).toBe('playSelect');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
