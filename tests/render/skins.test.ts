import { describe, expect, it } from 'vitest';
import { BOT_SKIN, paintVest } from '../../src/assets/skins';
import { createMatch, skinFor } from '../../src/engine/match';
import { botHooks } from '../../src/bots';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

/** an 8x14 body sprite: head rows on top, then jacket (182,123,32), skin (224,152,40) and an olive trouser pixel */
function sprite(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(8 * 14 * 4);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 8; x++) {
    const rgb = y < 9 ? [182, 123, 32] : x === 0 ? [224, 152, 40] : x === 1 ? [112, 104, 56] : [182, 123, 32];
    d.set([...rgb, 255], (y * 8 + x) * 4);
  }
  return d;
}
const px = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 3)];

describe('vest skins', () => {
  it('repaints only jacket pixels below the head, keeping skin and cloth', () => {
    const d = sprite();
    paintVest(d, 8, [{ x: 0, y: 0, w: 8, h: 14 }], 0); // blue
    expect(px(d, 2, 12)[2]).toBeGreaterThan(px(d, 2, 12)[0]!); // jacket turned blue
    expect(px(d, 0, 12)).toEqual([224, 152, 40]); // skin untouched
    expect(px(d, 1, 12)).toEqual([112, 104, 56]); // trousers untouched
    expect(px(d, 2, 3)).toEqual([182, 123, 32]); // head rows untouched
  });

  it('red and bot vests differ from blue', () => {
    const blue = sprite(); paintVest(blue, 8, [{ x: 0, y: 0, w: 8, h: 14 }], 0);
    const red = sprite(); paintVest(red, 8, [{ x: 0, y: 0, w: 8, h: 14 }], 1);
    const bot = sprite(); paintVest(bot, 8, [{ x: 0, y: 0, w: 8, h: 14 }], BOT_SKIN);
    expect(px(red, 2, 12)[0]).toBeGreaterThan(px(red, 2, 12)[2]!);
    expect(px(bot, 2, 12)).not.toEqual(px(blue, 2, 12));
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
