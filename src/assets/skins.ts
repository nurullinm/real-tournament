import type { CharsData } from './types';

/** Vest colours by skin: 0 blue, 1 red, 2 green, 3 yellow (the match colours) and 4 = bot (dark grey). */
export const BOT_SKIN = 4;
const VEST: [number, number, number][] = [[44, 84, 235], [222, 44, 44], [46, 176, 76], [236, 206, 44], [88, 90, 98]];
/** the soldier's jacket is these darker oranges; the lighter ones are skin and stay as they are */
const JACKET: [number, number, number][] = [[182, 123, 32], [149, 100, 23], [122, 94, 38], [206, 148, 7]];
/** browsers (iOS colour management) can shift pixels by a few levels, so match with a tolerance instead of exactly */
const TOLERANCE = 14;
const isJacket = (r: number, g: number, b: number): boolean => JACKET.some(([jr, jg, jb]) => Math.abs(r - jr) <= TOLERANCE && Math.abs(g - jg) <= TOLERANCE && Math.abs(b - jb) <= TOLERANCE);
const MID_LUM = 0.3 * 182 + 0.59 * 123 + 0.11 * 32;
/** the jacket sits below the head: pixels in the top rows of a body sprite are never recoloured */
const HEAD_ROWS = 9;

export interface Rect { x: number; y: number; w: number; h: number }

/** Every sub-image of the fighter sheets (1 and 2): arms, sleeves, torsos and the cycle all carry the jacket colour. */
export function fighterRects(chars: CharsData, sheet: number): Rect[] {
  return chars.subimages.filter((s) => s.sheet === sheet && s.w > 0 && s.h > 0);
}

/** Repaints the jacket pixels of `data` (RGBA, sheet-sized) for one vest colour, keeping the shading. Pure, testable. */
export function paintVest(data: Uint8ClampedArray, sheetW: number, rects: Rect[], skin: number): void {
  const [vr, vg, vb] = VEST[skin]!;
  for (const r of rects) {
    // a full body sprite starts with the head, which keeps its skin tones; arm and gear parts are painted entirely
    const top = r.y + (r.h >= 14 && r.w >= 8 && r.w <= 24 ? HEAD_ROWS : 0);
    for (let y = top; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = (y * sheetW + x) * 4;
        if (data[i + 3]! < 128 || !isJacket(data[i]!, data[i + 1]!, data[i + 2]!)) continue;
        const lum = 0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!;
        const k = Math.min(1.25, Math.max(0.55, lum / MID_LUM));
        data[i] = Math.min(255, vr * k);
        data[i + 1] = Math.min(255, vg * k);
        data[i + 2] = Math.min(255, vb * k);
      }
    }
  }
}

/** skins[skin][sheet]: the character sheets with the vest repainted; sheets without fighters are shared. */
export async function buildSkins(sheets: ImageBitmap[], chars: CharsData): Promise<ImageBitmap[][]> {
  const out: ImageBitmap[][] = [];
  for (let skin = 0; skin < VEST.length; skin++) {
    const row: ImageBitmap[] = [];
    for (let s = 0; s < sheets.length; s++) {
      const rects = s === 1 || s === 2 ? fighterRects(chars, s) : [];
      if (rects.length === 0) { row.push(sheets[s]!); continue; }
      const src = sheets[s]!;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const x = c.getContext('2d')!;
      x.drawImage(src, 0, 0);
      const img = x.getImageData(0, 0, c.width, c.height);
      paintVest(img.data, c.width, rects, skin);
      x.putImageData(img, 0, 0);
      row.push(await createImageBitmap(c));
    }
    out.push(row);
  }
  return out;
}
