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
  return !isHeadOrange(r, g, b);
}

export function isHeadOrange(r: number, g: number, b: number): boolean {
  return HEAD_ORANGES.some(([hr, hg, hb]) => Math.abs(r - hr) <= 6 && Math.abs(g - hg) <= 6 && Math.abs(b - hb) <= 6);
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

/** a sprite carries a head when it has at least this many pixels of the helmet orange (13 in the sheets) */
const HEAD_SIGNATURE_PIXELS = 8;

/**
 * The head box of a sprite: the bounding box of its helmet-orange pixels, grown by one pixel, or null when the sprite
 * has no head. Found from the pixels themselves because body sprites come in many sizes and poses (running, diving,
 * lying) and the head is not always at the top left.
 */
export function headBox(data: Uint8ClampedArray, sheetW: number, r: Rect): Rect | null {
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * sheetW + x) * 4;
      if (data[i + 3]! < 128 || !isHeadOrange(data[i]!, data[i + 1]!, data[i + 2]!)) continue;
      n++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (n < HEAD_SIGNATURE_PIXELS) return null;
  return { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 3, h: y1 - y0 + 3 };
}

/**
 * Repaints one sheet in place: every vest-orange pixel (chest, elbow pads, knee pads, gloves) of every sprite in `rects`,
 * except those inside the sprite's head box.
 */
export function paintSheet(data: Uint8ClampedArray, sheetW: number, rects: Rect[], skin: number): void {
  // head boxes first, from the untouched pixels: sprites can overlap in the sheet, and a head box protects its pixels
  // whichever sprite is being painted
  const heads = rects.map((r) => headBox(data, sheetW, r)).filter((h): h is Rect => h !== null);
  const inHead = (x: number, y: number): boolean => heads.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (inHead(x, y)) continue;
        tintVest(new Uint8ClampedArray(data.buffer, data.byteOffset + (y * sheetW + x) * 4, 4), 1, 1, 0, skin);
      }
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
