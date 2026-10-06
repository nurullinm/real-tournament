import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('original resources', () => {
  it('has tiles.png', () => {
    expect(existsSync('public/original/tiles.png')).toBe(true);
  });
  it('has all 12 map files', () => {
    for (let i = 0; i < 12; i++) {
      expect(existsSync(`public/original/${i}`), `map ${i}`).toBe(true);
    }
  });
});

describe('cover art', () => {
  it('ships a menu cover that stays small enough for mobile', async () => {
    const { statSync } = await import('node:fs');
    const size = statSync('public/art/cover.jpg').size;
    expect(size).toBeGreaterThan(50_000);
    expect(size).toBeLessThan(400_000);
  });
});
