import { describe, expect, it } from 'vitest';
import { createFakeScheduler } from '../input/fakeScheduler';
import { createInputMapper } from '../input/mapper';
import { handleMenuEvent } from './menuEvents';

function setup() {
  const clock = createFakeScheduler();
  const input = createInputMapper({ schedule: clock.schedule });
  const presses: string[] = [];
  input.onAction((a) => presses.push(a));
  let screen = 'playList';
  const flow = {
    send: (e: string) => {
      if (e === 'selectPlay') screen = 'inRun';
      if (e === 'back') screen = 'mainMenu';
    },
    state: () => ({ screen }),
  };
  let cleared = 0;
  const human = {
    clear: () => {
      cleared += 1;
    },
  };
  return { clock, input, presses, flow, human, cleared: () => cleared };
}

describe('handleMenuEvent', () => {
  it('drops the pending menu click when the event starts a run', () => {
    const { clock, input, presses, flow, human, cleared } = setup();
    input.press('Mouse0');
    handleMenuEvent(flow, input, human, 'selectPlay');
    input.release('Mouse0');
    clock.advance(1000);
    expect(presses).toEqual([]);
    expect(cleared()).toBe(1);
  });

  it('leaves input alone when the event does not start a run', () => {
    const { clock, input, presses, flow, human, cleared } = setup();
    input.press('Mouse0');
    handleMenuEvent(flow, input, human, 'back');
    input.release('Mouse0');
    clock.advance(1000);
    expect(presses.length).toBe(1);
    expect(cleared()).toBe(0);
  });
});
