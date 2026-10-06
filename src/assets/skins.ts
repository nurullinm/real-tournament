/** Vest colours by skin: 0 blue, 1 red, 2 green, 3 yellow (the match colours) and 4 = bot (dark grey). */
export const BOT_SKIN = 4;
const VEST: [number, number, number][] = [[44, 84, 235], [222, 44, 44], [46, 176, 76], [236, 206, 44], [88, 90, 98]];

/** helmet / face skin tones (see isVestOrange) */
const HEAD_ORANGES: [number, number, number][] = [[182, 123, 32], [235, 175, 83]];

/** shade reference: the light vest orange; darker and lighter oranges scale the new colour the same way */
const REF_LUM = 0.3 * 224 + 0.59 * 152 + 0.11 * 40;

/**
 * The soldier's vest is the orange of the torso. A pixel counts as vest orange when it is clearly orange-brown
 * (red > green > blue with a real green-over-blue gap): olive cloth, grey metal and the red/blue flags do not match.
 */
export function isVestOrange(r: number, g: number, b: number): boolean {
  if (!(r - g >= 18 && g - b >= 10 && r - b >= 45)) return false;
  // the helmet and face use two oranges the vest never does: they stay as they are in every sprite and frame
  return !HEAD_ORANGES.some(([hr, hg, hb]) => Math.abs(r - hr) <= 6 && Math.abs(g - hg) <= 6 && Math.abs(b - hb) <= 6);
}

/**
 * Repaints the vest-orange pixels of an RGBA image for one vest colour, keeping the shading. Rows above `firstRow`
 * (the head and its orange skin tones) are never touched. Pure, so it is unit-tested.
 */
export function tintVest(data: Uint8ClampedArray, width: number, height: number, firstRow: number, skin: number): void {
  const [vr, vg, vb] = VEST[skin] ?? VEST[BOT_SKIN]!;
  for (let y = Math.max(0, firstRow); y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3]! < 128 || !isVestOrange(data[i]!, data[i + 1]!, data[i + 2]!)) continue;
      const lum = 0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!;
      const k = Math.min(1.2, Math.max(0.5, lum / REF_LUM));
      data[i] = Math.min(255, vr * k);
      data[i + 1] = Math.min(255, vg * k);
      data[i + 2] = Math.min(255, vb * k);
    }
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Rows at the top of a head-bearing body sprite that belong to the head and its helmet. */
export const HEAD_ROWS = 6;

/** A sub-image that carries a head: full-height body sprites (the legs and the arm/gun parts are shorter). */
export const hasHead = (r: Rect): boolean => r.h >= 17 && r.w >= 12 && r.w <= 18;

/**
 * Repaints one sheet in place: every vest-orange pixel (chest, elbow pads, knee pads, gloves) of every sprite in `rects`,
 * except the head rows of body sprites. The head is decided per sprite, so it stays right in every run/jump frame.
 */
export function paintSheet(data: Uint8ClampedArray, sheetW: number, rects: Rect[], skin: number): void {
  for (const r of rects) {
    const top = r.y + (hasHead(r) ? HEAD_ROWS : 0);
    for (let y = top; y < r.y + r.h; y++) {
      const row = new Uint8ClampedArray(data.buffer, data.byteOffset + (y * sheetW + r.x) * 4, r.w * 4);
      tintVest(row, r.w, 1, 0, skin);
    }
  }
}

/** skins[skin][sheet]: the fighter sheets (1 and 2) with a repainted vest; the other sheets are shared as they are. */
export async function buildSkins(sheets: ImageBitmap[], rectsOf: (sheet: number) => Rect[]): Promise<ImageBitmap[][]> {
  const out: ImageBitmap[][] = [];
  for (let skin = 0; skin < VEST.length; skin++) {
    const row: ImageBitmap[] = [];
    for (let s = 0; s < sheets.length; s++) {
      const rects = s === 1 || s === 2 ? rectsOf(s) : [];
      const src = sheets[s]!;
      if (rects.length === 0) { row.push(src); continue; }
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const x = c.getContext('2d')!;
      x.drawImage(src, 0, 0);
      const img = x.getImageData(0, 0, c.width, c.height);
      paintSheet(img.data, c.width, rects, skin);
      x.putImageData(img, 0, 0);
      row.push(await createImageBitmap(c));
    }
    out.push(row);
  }
  return out;
}
