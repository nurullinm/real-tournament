import { describe, expect, it } from 'vitest';
import { BOT_SKIN, hasHead, isVestOrange, paintSheet, tintVest } from '../../src/assets/skins';
import { createMatch, skinFor } from '../../src/engine/match';
import { botHooks } from '../../src/bots';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

/** a 4x6 image: rows 0-1 head (orange skin), rows 2-5 chest orange / dark orange / olive cloth / red flag */
function sprite(): Uint8ClampedArray {
  const rows = [
    [[224, 152, 40], [224, 152, 40], [224, 152, 40], [224, 152, 40]],
    [[182, 123, 32], [182, 123, 32], [182, 123, 32], [182, 123, 32]],
    [[224, 152, 40], [149, 100, 23], [112, 104, 56], [207, 14, 14]],
    [[224, 152, 40], [149, 100, 23], [112, 104, 56], [207, 14, 14]],
    [[235, 175, 83], [83, 64, 24], [184, 176, 112], [90, 90, 89]],
    [[224, 152, 40], [149, 100, 23], [112, 104, 56], [207, 14, 14]],
  ];
  const d = new Uint8ClampedArray(4 * 6 * 4);
  rows.forEach((row, y) => row.forEach((rgb, x) => d.set([...rgb, 255], (y * 4 + x) * 4)));
  return d;
}
const px = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 3)];

describe('vest skins', () => {
  it('repaints the orange torso in every shade below the head, nothing else', () => {
    const d = sprite();
    tintVest(d, 4, 6, 2, 0); // blue vest, torso starts at row 2
    for (const [x, y] of [[0, 2], [1, 2], [0, 4], [1, 4], [0, 5]] as const) expect(px(d, x, y)[2]).toBeGreaterThan(px(d, x, y)[0]!); // blue now
    expect(px(d, 0, 0)).toEqual([224, 152, 40]); // head rows keep their skin
    expect(px(d, 0, 1)).toEqual([182, 123, 32]);
    expect(px(d, 2, 3)).toEqual([112, 104, 56]); // olive cloth
    expect(px(d, 3, 3)).toEqual([207, 14, 14]); // a carried red flag
    expect(px(d, 2, 4)).toEqual([184, 176, 112]);
    expect(px(d, 3, 4)).toEqual([90, 90, 89]);
  });

  it('keeps the shading: the shadowed orange stays darker than the lit orange', () => {
    const d = sprite();
    tintVest(d, 4, 6, 2, 0);
    const lit = px(d, 0, 2)[2]!;
    const shade = px(d, 1, 2)[2]!;
    expect(shade).toBeLessThan(lit);
  });

  it('red and bot vests differ from blue', () => {
    const blue = sprite(); tintVest(blue, 4, 6, 2, 0);
    const red = sprite(); tintVest(red, 4, 6, 2, 1);
    const bot = sprite(); tintVest(bot, 4, 6, 2, BOT_SKIN);
    expect(px(red, 0, 2)[0]).toBeGreaterThan(px(red, 0, 2)[2]!);
    expect(px(bot, 0, 2)).not.toEqual(px(blue, 0, 2));
  });

  it('matches only orange-brown pixels', () => {
    expect(isVestOrange(224, 152, 40)).toBe(true);
    expect(isVestOrange(149, 100, 23)).toBe(true);
    expect(isVestOrange(83, 64, 24)).toBe(true);
    expect(isVestOrange(112, 104, 56)).toBe(false);
    expect(isVestOrange(207, 14, 14)).toBe(false);
    expect(isVestOrange(0, 36, 255)).toBe(false);
  });

  it('Deathmatch: people keep their colour, bots are dark grey; CTF: team colours for everyone', () => {
    const dm = createMatch({ ...DM_OPTS, bots: 3, humans: 2 }, REAL_MAPS[0]!, 3, REAL_ASSETS, botHooks);
    expect(dm.fighters.map((f) => f.skin === BOT_SKIN)).toEqual([false, false, true, true]);
    expect(dm.fighters[0]!.skin).toBe(dm.fighters[0]!.color);
    const ctf = createMatch(CTF_OPTS, REAL_MAPS[7]!, 3, REAL_ASSETS, botHooks);
    expect(ctf.fighters.slice(0, ctf.numFighters).every((f) => f.skin === f.color && f.skin < 2)).toBe(true);
    const f = dm.fighters[1]!;
    f.human = false;
    expect(skinFor(dm, f)).toBe(BOT_SKIN); // a human who leaves turns into a bot
  });
});

describe('per-sprite head rule', () => {
  /** a 16x20 sheet area: all orange (224,152,40) */
  const sheet = (): Uint8ClampedArray => { const d = new Uint8ClampedArray(16 * 20 * 4); for (let i = 0; i < d.length; i += 4) d.set([224, 152, 40, 255], i); return d; };
  const rowOf = (d: Uint8ClampedArray, y: number): number[] => [...d.slice(y * 16 * 4, y * 16 * 4 + 3)];

  it('keeps the head rows of a full body sprite whatever its position in the sheet, paints everything below', () => {
    for (const top of [0, 2]) {
      const d = sheet();
      paintSheet(d, 16, [{ x: 0, y: top, w: 16, h: 18 }], 0);
      expect(rowOf(d, top + 5)).toEqual([224, 152, 40]); // helmet row untouched
      expect(rowOf(d, top + 6)[2]).toBeGreaterThan(rowOf(d, top + 6)[0]!); // chest blue
    }
  });

  it('paints limb parts (knee pads, elbow pads, gloves) from their first row', () => {
    const d = sheet();
    paintSheet(d, 16, [{ x: 0, y: 0, w: 8, h: 15 }], 1);
    expect(rowOf(d, 0)[0]).toBeGreaterThan(rowOf(d, 0)[2]!); // red from row 0
    expect(hasHead({ x: 0, y: 0, w: 8, h: 15 })).toBe(false);
    expect(hasHead({ x: 0, y: 0, w: 16, h: 32 })).toBe(true);
  });
});

describe('online vest colours', () => {
  it('humans keep the colours they picked and bots take what is left', () => {
    const m = createMatch({ ...DM_OPTS, bots: 3, humans: 2, humanColors: [2, 0] }, REAL_MAPS[0]!, 5, REAL_ASSETS, botHooks);
    expect(m.fighters.slice(0, 2).map((f) => f.color)).toEqual([2, 0]);
    expect(m.fighters.slice(0, 2).map((f) => f.skin)).toEqual([2, 0]);
    expect(new Set(m.fighters.map((f) => f.color)).size).toBe(4); // all distinct
  });
});
