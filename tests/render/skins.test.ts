import { describe, expect, it } from 'vitest';
import { BOT_SKIN, headBox, isVestOrange, paintSheet, tintVest } from '../../src/assets/skins';
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
    for (const [x, y] of [[0, 2], [1, 2], [1, 4], [0, 5]] as const) expect(px(d, x, y)[2]).toBeGreaterThan(px(d, x, y)[0]!); // blue now
    expect(px(d, 0, 0)).toEqual([224, 152, 40]); // head rows keep their skin
    expect(px(d, 0, 1)).toEqual([182, 123, 32]);
    expect(px(d, 2, 3)).toEqual([112, 104, 56]); // olive cloth
    expect(px(d, 3, 3)).toEqual([207, 14, 14]); // a carried red flag
    expect(px(d, 0, 4)).toEqual([235, 175, 83]); // face-highlight orange is never vest
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
    expect(isVestOrange(182, 123, 32)).toBe(false); // helmet orange
    expect(isVestOrange(235, 175, 83)).toBe(false); // face highlight
    expect(isVestOrange(83, 64, 24)).toBe(true);
    expect(isVestOrange(112, 104, 56)).toBe(false);
    expect(isVestOrange(207, 14, 14)).toBe(false);
    expect(isVestOrange(0, 36, 255)).toBe(false);
  });

  it('only people wear a coloured vest: bots are dark grey in Deathmatch and in CTF', () => {
    const dm = createMatch({ ...DM_OPTS, bots: 3, humans: 2 }, REAL_MAPS[0]!, 3, REAL_ASSETS, botHooks);
    expect(dm.fighters.map((f) => f.skin === BOT_SKIN)).toEqual([false, false, true, true]);
    expect(dm.fighters[0]!.skin).toBe(dm.fighters[0]!.color);
    const ctf = createMatch(CTF_OPTS, REAL_MAPS[7]!, 3, REAL_ASSETS, botHooks);
    // CTF solo: the player wears the team colour, his ally and both enemies are bots
    expect(ctf.fighters.map((f) => f.skin)).toEqual([ctf.fighters[0]!.color, BOT_SKIN, BOT_SKIN, BOT_SKIN]);
    const f = dm.fighters[1]!;
    f.human = false;
    expect(skinFor(dm, f)).toBe(BOT_SKIN); // a human who leaves turns into a bot
  });
});

describe('per-sprite head box', () => {
  /** a 24x24 sheet area of vest orange with a helmet (13 helmet-orange pixels) whose top-left is at (hx, hy) */
  const sheet = (hx: number, hy: number): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(24 * 24 * 4);
    for (let i = 0; i < d.length; i += 4) d.set([224, 152, 40, 255], i);
    for (let k = 0; k < 13; k++) d.set([182, 123, 32, 255], (((hy + (k % 5)) * 24) + hx + (k % 3)) * 4);
    return d;
  };
  const px = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.slice((y * 24 + x) * 4, (y * 24 + x) * 4 + 3)];

  it('finds the head wherever it is in the sprite (standing, or on the right of a diving pose)', () => {
    expect(headBox(sheet(2, 1), 24, { x: 0, y: 0, w: 24, h: 24 })).toMatchObject({ x: 1, y: 0 });
    const diving = headBox(sheet(18, 4), 24, { x: 0, y: 0, w: 24, h: 24 })!;
    expect(diving.x).toBeGreaterThanOrEqual(17);
    expect(diving.y).toBeGreaterThanOrEqual(3);
    expect(headBox(sheet(2, 1).fill(0), 24, { x: 0, y: 0, w: 24, h: 24 })).toBeNull(); // no head, no box
  });

  it('never repaints inside the head box, also for a head far from the top-left', () => {
    const d = sheet(18, 4);
    paintSheet(d, 24, [{ x: 0, y: 0, w: 24, h: 24 }], 0);
    expect(px(d, 17, 3)).toEqual([224, 152, 40]); // face orange around the helmet pixels stays
    expect(px(d, 3, 15)[2]).toBeGreaterThan(px(d, 3, 15)[0]!); // body far from the head is blue
  });

  it('paints limb parts without a head from their first row', () => {
    const d = new Uint8ClampedArray(24 * 24 * 4);
    for (let i = 0; i < d.length; i += 4) d.set([224, 152, 40, 255], i);
    paintSheet(d, 24, [{ x: 0, y: 0, w: 8, h: 15 }], 1);
    expect(px(d, 3, 0)[0]).toBeGreaterThan(px(d, 3, 0)[2]!); // red from row 0
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
