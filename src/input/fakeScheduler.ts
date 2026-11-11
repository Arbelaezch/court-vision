// Hand-rolled fake clock for tests: no real timers.
import type { Schedule } from './mapper';

export interface FakeScheduler {
  schedule: Schedule;
  advance(ms: number): void;
  now(): number;
  pendingCount(): number;
}

interface Entry {
  id: number;
  due: number;
  fn: () => void;
}

export function createFakeScheduler(): FakeScheduler {
  let time = 0;
  let nextId = 0;
  let entries: Entry[] = [];

  return {
    schedule(fn, delayMs) {
      const entry: Entry = { id: nextId++, due: time + delayMs, fn };
      entries.push(entry);
      return () => {
        entries = entries.filter((e) => e !== entry);
      };
    },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        const due = entries
          .filter((e) => e.due <= target)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!due) break;
        entries = entries.filter((e) => e !== due);
        time = Math.max(time, due.due);
        due.fn();
      }
      time = target;
    },
    now: () => time,
    pendingCount: () => entries.length,
  };
}
