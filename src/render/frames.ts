import type { Sprites } from '../assets/sprites';

/** Draws character-sheet frame `frame` (part list from /chars) with its origin at world (x, y). */
export function drawFrame(ctx: CanvasRenderingContext2D, sprites: Sprites, frame: number, x: number, y: number, skin = -1): void {
  const { chars } = sprites;
  for (let p = chars.frameStart[frame]; p !== undefined; p++) {
    const part = chars.parts[p];
    if (!part || part.sub < 0) break;
    drawSub(ctx, sprites, part.sub, x + part.x, y + part.y, skin);
  }
}

export function drawSub(ctx: CanvasRenderingContext2D, sprites: Sprites, sub: number, x: number, y: number, skin = -1): void {
  const s = sprites.chars.subimages[sub];
  const sheet = s && ((skin >= 0 ? sprites.skins?.[skin]?.[s.sheet] : undefined) ?? sprites.sheets[s.sheet]);
  if (!s || !sheet || s.w <= 0 || s.h <= 0) return;
  ctx.drawImage(sheet, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
}
