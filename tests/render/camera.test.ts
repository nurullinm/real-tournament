import { describe, expect, it } from 'vitest';
import { cameraTarget, computeCamera, followCamera } from '../../src/render/camera';

const view = { w: 480, h: 220 };

describe('computeCamera', () => {
  it('clamps to the map edges', () => {
    const map = { w: 1000, h: 600 };
    expect(computeCamera({ x: -50, y: -10 }, view, map)).toEqual({ x: 0, y: 0 });
    expect(computeCamera({ x: 900, y: 900 }, view, map)).toEqual({ x: 520, y: 380 });
  });
  it('centres a map that is narrower than the view (map 5 is 20 tiles wide)', () => {
    const cam = computeCamera({ x: 123, y: 300 }, view, { w: 320, h: 608 });
    expect(cam.x).toBe(-80); // 80 px of margin on each side
    expect(cam.y).toBeGreaterThanOrEqual(0);
  });
  it('centres a map that is shorter than the view', () => {
    const cam = computeCamera({ x: 100, y: 50 }, view, { w: 1000, h: 160 });
    expect(cam.y).toBe(-30);
  });
  it('is stable for a map exactly the size of the view', () => {
    expect(computeCamera({ x: 5, y: 5 }, view, { w: 480, h: 220 })).toEqual({ x: 0, y: 0 });
  });
});

describe('camera follow', () => {
  it('looks ahead of the player depending on facing', () => {
    const p = { x: 500, y: 300 };
    const right = cameraTarget(p, false, { w: 176, h: 192 });
    const left = cameraTarget(p, true, { w: 176, h: 192 });
    expect(p.x - right.x).toBe(58);
    expect(p.x - left.x).toBe(118);
    expect(p.y - right.y).toBe(112);
  });
  it('moves at most maxStep px per tick', () => {
    expect(followCamera({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)).toEqual({ x: 5, y: 0 });
    expect(followCamera({ x: 100, y: 0 }, { x: 0, y: 0 }, 5)).toEqual({ x: 95, y: 0 });
    expect(followCamera({ x: 10, y: 0 }, { x: 12, y: 0 }, 5)).toEqual({ x: 12, y: 0 });
  });
});
