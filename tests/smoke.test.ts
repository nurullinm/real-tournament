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
