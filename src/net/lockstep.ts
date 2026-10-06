import { cmdToInput } from '../engine/match';
import type { InputState } from '../engine/types';
import type { WireInput } from './protocol';

export interface NetTick { n: number; inputs: Map<number, InputState>; dropped: number[] }

export function wireToInput(w: WireInput): InputState {
  const i = cmdToInput(w.c);
  i.weaponSelect = w.ws;
  i.weaponDelta = w.wd;
  return i;
}

/**
 * Client side of the lockstep: ticks arrive from the server in order; the simulation only advances by a tick the
 * server has issued, so every client applies identical input at identical ticks.
 */
export class Lockstep {
  private queue: NetTick[] = [];
  private next = 1;
  /** humans that are still player-controlled */
  private live: Set<number>;

  constructor(humans: number) {
    this.live = new Set(Array.from({ length: humans }, (_, i) => i));
  }

  /** Feeds a server tick message; out-of-order or duplicate ticks are ignored. */
  push(n: number, i: WireInput[], d: number[] = []): void {
    const last = this.queue.length ? this.queue[this.queue.length - 1]!.n : this.next - 1;
    if (n !== last + 1) return;
    const inputs = new Map<number, InputState>();
    i.forEach((w, slot) => { if (!d.includes(slot)) inputs.set(slot, wireToInput(w)); });
    this.queue.push({ n, inputs, dropped: d });
  }

  get backlog(): number { return this.queue.length; }

  /** Next tick to simulate, or null if the server hasn't sent it yet (the caller waits). */
  pull(): NetTick | null {
    const t = this.queue.shift();
    if (!t) return null;
    this.next = t.n + 1;
    for (const s of t.dropped) this.live.delete(s);
    // dropped humans stay out of the map: the engine hands them to the AI
    for (const s of [...t.inputs.keys()]) if (!this.live.has(s)) t.inputs.delete(s);
    return t;
  }
}
