import { describe, expect, it } from 'vitest';
import { loadAllMapsFromDisk, loadPassabilityFromDisk, loadCharsFromDisk, loadStringsFromDisk } from '../../src/assets/disk';

const DIR = 'public/original';
const maps = loadAllMapsFromDisk(DIR);

describe('maps', () => {
  it('parses all 12 maps with consistent dimensions', () => {
    expect(maps).toHaveLength(12);
    for (const m of maps) expect(m.tiles.length, `map ${m.id}`).toBe(m.width * m.height);
  });
  it('matches known sizes', () => {
    expect([maps[0]!.width, maps[0]!.height]).toEqual([40, 16]);
    expect([maps[5]!.width, maps[5]!.height]).toEqual([20, 38]);
    expect([maps[9]!.width, maps[9]!.height]).toEqual([66, 20]);
  });
  it('every map has at least 2 spawn nodes and valid node indices', () => {
    for (const m of maps) {
      expect(m.dmBlue.length, `map ${m.id}`).toBeGreaterThanOrEqual(2);
      for (const n of [...m.dmBlue, ...m.dmRed]) expect(n).toBeLessThan(m.nodes.length);
    }
  });
  it('CTF maps 7-11 have both flag bases and red spawns', () => {
    for (let i = 7; i < 12; i++) {
      const m = maps[i]!;
      expect(m.pobjs.some((p) => p.type === 10), `blue base ${i}`).toBe(true);
      expect(m.pobjs.some((p) => p.type === 11), `red base ${i}`).toBe(true);
      expect(m.dmRed.length).toBeGreaterThan(0);
    }
  });
  it('tram and cycle data match the original', () => {
    expect(maps[2]!.tram).toEqual({ x1: 208, x2: 640, y: 352 });
    expect(maps[0]!.tram.y).toBe(0);
    expect(maps[4]!.cycle).toEqual({ x1: 256, y1: 32, x2: 624, y2: 416 });
    expect(maps[0]!.cycle).toBeNull();
    expect(maps[4]!.docksLeft).toHaveLength(3);
    expect(maps[4]!.docksRight).toHaveLength(2);
  });
  it('sets pobj data1 to y>>4 for type>=2', () => {
    for (const m of maps) for (const p of m.pobjs) if (p.type >= 2) expect(p.data1).toBe(p.y >> 4);
  });
});

describe('other assets', () => {
  it('passability table has 64 entries', () => {
    expect(loadPassabilityFromDisk(DIR)).toHaveLength(64);
  });
  it('help.str contains Medikit', () => {
    expect(loadStringsFromDisk(DIR, 'help.str').some((s) => s.includes('Medikit'))).toBe(true);
  });
  it('real.str has the Wait string first', () => {
    expect(loadStringsFromDisk(DIR, 'real.str')[0]).toBe('Wait');
  });
  it('chars parses 129 sub-images and 191 frames', () => {
    const c = loadCharsFromDisk(DIR);
    expect(c.subimages).toHaveLength(0x81);
    expect(c.frameStart).toHaveLength(191);
    expect(c.parts.length).toBeGreaterThan(0);
  });
});
