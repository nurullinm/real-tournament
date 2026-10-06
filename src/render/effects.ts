import type { Sprites } from '../assets/sprites';
import type { GameEvent } from '../engine/types';
import { drawFrame } from './frames';

/** Visual effect sequences from the original (chars frame numbers); played back-to-front like the original's countdown. */
const SEQ: Record<string, readonly number[]> = {
  blood0: [57, 57, 57],
  blood1: [58, 58, 58, 58],
  blood2: [129, 129, 128, 128, 127, 127],
  smoke: [61, 61, 61, 62, 62, 62],
  smokeLong: [61, 61, 61, 61, 62, 62, 62, 62],
  explosion: [63, 63, 63, 64, 64, 64, 65, 65, 65, 64],
  respawnItem: [125, 125, 125, 124, 124, 124, 123, 123, 123],
};
const RESPAWN_VARIANTS: readonly (readonly number[])[] = [
  [125, 125, 125, 124, 124, 124, 123, 123, 123],
  [125, 125, 125, 125, 124, 124, 124, 124, 123, 123, 123, 123],
  [125, 125, 124, 124, 123, 123],
];
const MAX_SPRITES = 30;

interface Fx {
  seq: readonly number[];
  left: number;
  x: number;
  y: number;
}

export class Effects {
  private list: Fx[] = [];

  /** Turns engine `fx` events into sprites (call once per engine tick). */
  spawn(events: readonly GameEvent[], tick: number): void {
    let variant = tick;
    for (const e of events) {
      if (e.kind !== 'fx') continue;
      const seq = e.seq === 'respawn' ? RESPAWN_VARIANTS[variant++ % 3] : SEQ[e.seq];
      if (!seq || this.list.length >= MAX_SPRITES) continue;
      this.list.push({ seq, left: seq.length, x: e.x, y: e.y });
    }
  }

  /** One engine tick of animation: sprites advance and expire. */
  advance(): void {
    for (const f of this.list) f.left--;
    this.list = this.list.filter((f) => f.left > 0);
  }

  get count(): number {
    return this.list.length;
  }

  draw(ctx: CanvasRenderingContext2D, sprites: Sprites): void {
    for (const f of this.list) drawFrame(ctx, sprites, f.seq[f.left - 1]!, f.x, f.y);
  }
}
