// Audio layer: recording AudioContext test double. Not exported from the barrel.

import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
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
  constructor(readonly kind: 'gain' | 'oscillator' | 'bufferSource' | 'destination') {}
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

export class FakeBuffer implements AudioBufferLike {
  readonly channels: Float32Array[];
  constructor(
    numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (data === undefined) throw new Error(`FakeBuffer: no channel ${channel}`);
    return data;
  }
}

export class FakeBufferSource extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor() {
    super('bufferSource');
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
  readonly sampleRate: number;
  readonly destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  constructor(opts: { state?: AudioContextState; currentTime?: number; sampleRate?: number } = {}) {
    this.state = opts.state ?? 'running';
    this.currentTime = opts.currentTime ?? 0;
    this.sampleRate = opts.sampleRate ?? 8000;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.nodes.push(node);
    return node;
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
  sampleRate?: number;
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
