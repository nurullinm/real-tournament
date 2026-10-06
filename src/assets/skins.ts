/** Vest colours by skin: 0 blue, 1 red, 2 green, 3 yellow (the match colours) and 4 = bot (dark grey). */
export const BOT_SKIN = 4;
const VEST: [number, number, number][] = [[44, 84, 235], [222, 44, 44], [46, 176, 76], [236, 206, 44], [88, 90, 98]];

/** shade reference: the light vest orange; darker and lighter oranges scale the new colour the same way */
const REF_LUM = 0.3 * 224 + 0.59 * 152 + 0.11 * 40;

/**
 * The soldier's vest is the orange of the torso. A pixel counts as vest orange when it is clearly orange-brown
 * (red > green > blue with a real green-over-blue gap): olive cloth, grey metal and the red/blue flags do not match.
 */
export function isVestOrange(r: number, g: number, b: number): boolean {
  return r - g >= 18 && g - b >= 10 && r - b >= 45;
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
