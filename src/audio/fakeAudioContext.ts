// Audio layer: recording AudioContext test double. Not exported from the barrel.

import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
} from './types';

export interface AutomationEvent {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
  value: number;
  time: number;
}

export class FakeParam implements AudioParamLike {
  value = 0;
  automation: AutomationEvent[] = [];
  setValueAtTime(value: number, time: number): void {
    this.automation.push({ method: 'setValueAtTime', value, time });
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.automation.push({ method: 'linearRampToValueAtTime', value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.automation.push({ method: 'exponentialRampToValueAtTime', value, time });
  }
}

export class FakeNode implements AudioNodeLike {
  connections: FakeNode[] = [];
  constructor(readonly kind: 'gain' | 'oscillator' | 'destination') {}
  connect(destination: AudioNodeLike): void {
    this.connections.push(destination as FakeNode);
  }
  disconnect(): void {
    this.connections = [];
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

export class FakeOscillator extends FakeNode implements OscillatorNodeLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor() {
    super('oscillator');
  }
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime: number;
  state: AudioContextState;
  readonly destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  constructor(opts: { state?: AudioContextState; currentTime?: number } = {}) {
    this.state = opts.state ?? 'running';
    this.currentTime = opts.currentTime ?? 0;
  }

  createGain(): FakeGain {
    const node = new FakeGain();
    this.nodes.push(node);
    return node;
  }

  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.nodes.push(node);
    return node;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    return Promise.resolve();
  }
}

export function createFakeAudioContext(opts?: {
  state?: AudioContextState;
  currentTime?: number;
}): FakeAudioContext {
  return new FakeAudioContext(opts);
}

export function pathReaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const stack = [from];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...n.connections);
  }
  return false;
}
