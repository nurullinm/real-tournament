import type { Sprites } from '../assets/sprites';
import type { Fighter, Match } from '../engine/types';
import type { Point } from './camera';
import { drawFrame } from './frames';

export const TILE = 16;
const TILES_PER_ROW = 8;

/** chars frame per pobj type (r_frames_for_pobjs); index >= length is not drawn. */
const POBJ_FRAMES = [0, 70, 53, 187, 59, 60, 66, 73, 98, 71, 85, 91, 69, 68, 68, 69, 72, 67, 70, 70, 97, 97, 132, 133] as const;

/** Purely cosmetic animation counters (armor spin, flag wave, blinking lights). */
export interface WorldAnim {
  armorFrame: number;
  flagFrame: number;
  light22: number;
  light23: number;
}

export const newWorldAnim = (): WorldAnim => ({ armorFrame: 73, flagFrame: 0, light22: 132, light23: 133 });

export function advanceWorldAnim(a: WorldAnim, tick: number): void {
  a.armorFrame = a.armorFrame >= 84 || a.armorFrame < 73 ? 73 : a.armorFrame + 1;
  a.flagFrame = a.flagFrame >= 5 ? 0 : a.flagFrame + 1;
  if ((tick * 2654435761 >>> 0) % 128 === 0) a.light22 = a.light22 === 132 ? 131 : 132;
  if ((tick * 40503 >>> 0) % 16 === 0) a.light23 = a.light23 === 133 ? 130 : 133;
}

function pobjFrame(type: number, a: WorldAnim): number | null {
  if (type < 0 || type >= POBJ_FRAMES.length) return null;
  switch (type) {
    case 7: return a.armorFrame;
    case 10: return 85 + a.flagFrame;
    case 11: return 91 + a.flagFrame;
    case 22: return a.light22;
    case 23: return a.light23;
    default: return POBJ_FRAMES[type]!;
  }
}

/** Resets the canvas transform to integer-scaled pixel art with the camera at the top-left. */
export function beginWorld(ctx: CanvasRenderingContext2D, cam: Point, scale: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, -cam.x * scale, -cam.y * scale);
}

/** Draws the tile layer, pickups/flags/lift cars and the tram. The ctx must be in `beginWorld` space. */
export function drawWorld(
  ctx: CanvasRenderingContext2D, m: Match, cam: Point, view: { w: number; h: number }, sprites: Sprites, anim: WorldAnim,
  /** draws a lift passenger; called right after its car so the door frames drawn later cover it, as in the original */
  drawRider?: (f: Fighter) => void,
): void {
  const u0 = Math.max(0, Math.floor(cam.x / TILE));
  const v0 = Math.max(0, Math.floor(cam.y / TILE));
  const u1 = Math.min(m.ntilesx - 1, Math.floor((cam.x + view.w) / TILE));
  const v1 = Math.min(m.ntilesy - 1, Math.floor((cam.y + view.h) / TILE));
  for (let v = v0; v <= v1; v++) {
    for (let u = u0; u <= u1; u++) {
      const t = m.map.tiles[v * m.ntilesx + u]!;
      ctx.drawImage(sprites.tiles, (t % TILES_PER_ROW) * TILE, Math.floor(t / TILES_PER_ROW) * TILE, TILE, TILE, u * TILE, v * TILE, TILE, TILE);
    }
  }
  for (const p of m.pobjs) {
    const frame = pobjFrame(p.type, anim);
    if (frame === null) continue;
    if (p.x < cam.x - 32 || p.x > cam.x + view.w + 32 || p.y < cam.y - 32 || p.y > cam.y + view.h + 48) continue;
    drawFrame(ctx, sprites, frame, p.x, p.y);
    if ((p.type === 1 || p.type === 18 || p.type === 19) && p.data2 >= 0 && drawRider) drawRider(m.fighters[p.data2]!);
  }
}

/** The tram is drawn after fighters and effects (it can pass in front of them), like the original. */
export function drawTram(ctx: CanvasRenderingContext2D, m: Match, view: { w: number; h: number }, cam: Point, sprites: Sprites): void {
  if (m.tram.y === 0) return;
  if (m.tram.x < cam.x - 64 || m.tram.x > cam.x + view.w + 64) return;
  drawFrame(ctx, sprites, 126, m.tram.x, m.tram.y);
}
