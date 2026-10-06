import { describe, expect, it } from 'vitest';
import { computeScale } from '../../src/render/scale';

describe('computeScale', () => {
  it('iPhone 17 Pro Max landscape (956x440 pt, dpr 3): integer scale, about 30x14 tiles', () => {
    const s = computeScale(956, 440, 3, 16, 14);
    expect(Number.isInteger(s.scale)).toBe(true);
    expect(s.scale).toBe(6);
    expect(Math.round(s.viewTilesW)).toBe(30);
    expect(Math.round(s.viewTilesH)).toBe(14);
  });
  it('covers the whole canvas: logical view * scale >= physical size', () => {
    for (const [w, h, d] of [[956, 440, 3], [667, 375, 2], [800, 360, 2.625], [320, 200, 1]] as const) {
      const s = computeScale(w, h, d, 16, 14);
      expect(s.viewW * s.scale).toBeGreaterThanOrEqual(Math.round(w * d));
      expect(s.viewH * s.scale).toBeGreaterThanOrEqual(Math.round(h * d));
    }
  });
  it('never returns a scale below 1', () => {
    expect(computeScale(100, 50, 1, 16, 14).scale).toBe(1);
  });
});
