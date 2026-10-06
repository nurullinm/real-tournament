import { describe, expect, it } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import { advanceWorldAnim, drawWorld, newWorldAnim } from '../../src/render/world';
import { roomMatchWith } from '../engine/helpers';

const chars = loadCharsFromDisk('public/original');
const img = {} as ImageBitmap;
const sprites = { tiles: img, sheets: [img, img, img, img], chars } as unknown as Sprites;

function mockCtx() {
  const calls: unknown[][] = [];
  const ctx = { drawImage: (...a: unknown[]) => { calls.push(a); } } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('drawWorld', () => {
  it('draws only the tiles inside the view', () => {
    const m = roomMatchWith({});
    const { ctx, calls } = mockCtx();
    drawWorld(ctx, m, { x: 0, y: 0 }, { w: 48, h: 32 }, sprites, newWorldAnim());
    const tiles = calls.filter((c) => c[0] === img && c.length === 9 && c[3] === 16);
    expect(tiles.length).toBeLessThanOrEqual(4 * 3);
    expect(tiles.length).toBeGreaterThan(0);
  });
  it('draws pickups but not hidden (consumed) ones', () => {
    const med = { type: 5, x: 32, y: 32, data1: 2 };
    const m = roomMatchWith({ pobjs: [med] });
    const a = mockCtx();
    drawWorld(a.ctx, m, { x: 0, y: 0 }, { w: 320, h: 160 }, sprites, newWorldAnim());
    const withItem = a.calls.length;
    m.pobjs[0]!.type |= 0x40;
    const b = mockCtx();
    drawWorld(b.ctx, m, { x: 0, y: 0 }, { w: 320, h: 160 }, sprites, newWorldAnim());
    expect(withItem).toBeGreaterThan(b.calls.length);
  });
  it('culls objects far outside the view', () => {
    const m = roomMatchWith({ pobjs: [{ type: 5, x: 5000, y: 32, data1: 2 }] });
    const a = mockCtx();
    drawWorld(a.ctx, m, { x: 0, y: 0 }, { w: 320, h: 160 }, sprites, newWorldAnim());
    const m2 = roomMatchWith({});
    const b = mockCtx();
    drawWorld(b.ctx, m2, { x: 0, y: 0 }, { w: 320, h: 160 }, sprites, newWorldAnim());
    expect(a.calls.length).toBe(b.calls.length);
  });
});

describe('world animation', () => {
  it('armor frames cycle 73..84', () => {
    const a = newWorldAnim();
    const seen = new Set<number>();
    for (let t = 0; t < 40; t++) {
      advanceWorldAnim(a, t);
      seen.add(a.armorFrame);
    }
    expect(Math.min(...seen)).toBe(73);
    expect(Math.max(...seen)).toBe(84);
  });
});
