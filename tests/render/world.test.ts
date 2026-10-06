import { describe, expect, it } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import { advanceWorldAnim, drawTram, drawWorld, newWorldAnim } from '../../src/render/world';
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

describe('lift draw order (as in the original)', () => {
  const cab = chars.subimages[48]!; // moving car (frame 70)
  const doors = chars.subimages[49]!; // door panel of a closed stop (frame 67)
  const isSub = (a: unknown[], s: { x: number; y: number; w: number; h: number }) => a[1] === s.x && a[2] === s.y && a[3] === s.w && a[4] === s.h;

  it('draws the rider after its car and before the closed doors of the stops, so the doors cover it', () => {
    const m = roomMatchWith({ pobjs: [{ type: 1, x: 100, y: 100, data1: 0 }, { type: 9, x: 100, y: 64, data1: 4 }, { type: 9, x: 100, y: 160, data1: 10 }] });
    m.pobjs[0]!.type = 19; // car moving up
    m.pobjs[0]!.data2 = 0; // carrying fighter 0
    m.pobjs[1]!.type = 17; // closed doors at both stops
    m.pobjs[2]!.type = 17;
    m.numFighters = 1;
    const events: string[] = [];
    const ctx = { drawImage: (...a: unknown[]) => { events.push(isSub(a, cab) ? 'car' : isSub(a, doors) ? 'doors' : 'other'); } } as unknown as CanvasRenderingContext2D;
    drawWorld(ctx, m, { x: 0, y: 0 }, { w: 320, h: 200 }, sprites, newWorldAnim(), () => { events.push('RIDER'); });
    const car = events.indexOf('car');
    const rider = events.indexOf('RIDER');
    const firstDoors = events.indexOf('doors');
    expect(car).toBeGreaterThanOrEqual(0);
    expect(rider).toBeGreaterThan(car);
    expect(firstDoors).toBeGreaterThan(rider);
    expect(events.filter((e) => e === 'RIDER')).toHaveLength(1);
  });

  it('a moving car without a rider calls no rider drawing', () => {
    const m = roomMatchWith({ pobjs: [{ type: 1, x: 100, y: 100, data1: 0 }, { type: 9, x: 100, y: 64, data1: 4 }, { type: 9, x: 100, y: 160, data1: 10 }] });
    m.pobjs[0]!.type = 19;
    m.pobjs[0]!.data2 = -1;
    let called = 0;
    drawWorld({ drawImage() {} } as unknown as CanvasRenderingContext2D, m, { x: 0, y: 0 }, { w: 320, h: 200 }, sprites, newWorldAnim(), () => { called++; });
    expect(called).toBe(0);
  });

  it('the tram is drawn by drawTram, after the world, and only when on screen', () => {
    const m = roomMatchWith({ tram: { x1: 100, x2: 200, y: 160 } });
    const calls: number[] = [];
    const ctx = { drawImage: () => { calls.push(1); } } as unknown as CanvasRenderingContext2D;
    drawWorld(ctx, m, { x: 0, y: 0 }, { w: 320, h: 200 }, sprites, newWorldAnim());
    const worldCalls = calls.length;
    drawTram(ctx, m, { w: 320, h: 200 }, { x: 0, y: 0 }, sprites);
    expect(calls.length).toBeGreaterThan(worldCalls);
    const far = calls.length;
    drawTram(ctx, m, { w: 320, h: 200 }, { x: 5000, y: 0 }, sprites);
    expect(calls.length).toBe(far);
  });
});
