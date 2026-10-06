import type { Sprites } from '../assets/sprites';
import { FIRE_SEQ } from '../engine/constants';
import type { Fighter, Match } from '../engine/types';
import { drawFrame, drawSub } from './frames';
import type { WorldAnim } from './world';

/** R_RenderFighter: body frame (mirrored frames start at +134), weapon sprite on the placeholder part, flag, health bar. */
export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, tick: number, sprites: Sprites, anim: WorldAnim): void {
  if (f.hp <= 0 && f.busyIndex === 0 && !f.isCycling) return;
  const y = f.isCycling && (tick & 8) === 0 ? f.y + 1 : f.y;
  drawBody(ctx, f, y, tick, sprites, anim, f.x);
  if (f.hp > 0) {
    const w = Math.ceil(f.hp / 20) * 4;
    ctx.drawImage(sprites.energy, 0, f.color * 3, w, 3, f.x - 9, y - 37, w, 3);
  }
}

/** The soldier or cyclist (and carried flag) with its feet at (x, y) of `ctx`. */
function drawBody(ctx: CanvasRenderingContext2D, f: Fighter, y: number, tick: number, sprites: Sprites, anim: WorldAnim, x: number): void {
  if (f.isCycling) {
    if (f.isCarrying) drawFrame(ctx, sprites, (f.headsLeft ? f.flagBaseLeft : f.flagBaseRight) + anim.flagFrame, x + (f.headsLeft ? 7 : -7), y);
    let frame = (tick & 2) === 0 ? 54 : 55;
    if (!f.headsLeft) frame += 134;
    drawFrame(ctx, sprites, frame, x, y, f.skin);
  } else {
    if (f.isCarrying) drawFrame(ctx, sprites, (f.headsLeft ? f.flagBaseLeft : f.flagBaseRight) + anim.flagFrame, x, y);
    const frame = f.frame + (f.headsLeft ? 0 : 134);
    const { chars } = sprites;
    for (let p = chars.frameStart[frame]; p !== undefined; p++) {
      const part = chars.parts[p];
      if (!part || part.sub < 0) break;
      if (part.sub === 23) {
        let off = FIRE_SEQ[f.currentWeapon]?.[f.weaponState] ?? 0;
        if (off === 7 && (tick & 2) === 0) off = 8;
        const wp = chars.parts[p + off];
        if (wp && wp.sub >= 0) drawSub(ctx, sprites, wp.sub, x + wp.x, y + wp.y, f.skin);
        break;
      }
      drawSub(ctx, sprites, part.sub, x + part.x, y + part.y, f.skin);
    }
  }
}

/** Fighters (lift passengers included), projectiles and laser rays. World space. */
export function drawActors(ctx: CanvasRenderingContext2D, m: Match, sprites: Sprites, anim: WorldAnim): void {
  for (let i = 0; i < m.numFighters; i++) {
    const f = m.fighters[i]!;
    if (f.isPassenger && f.liftcar >= 0) continue; // lift riders are drawn together with their car (drawWorld)
    drawFighter(ctx, f, m.tick, sprites, anim);
  }
  for (const r of m.rays) {
    const age = m.tick - r.tick;
    const lo = Math.min(r.x1, r.x2);
    ctx.fillStyle = `#${r.dim.toString(16).padStart(6, '0')}`;
    ctx.fillRect(lo, r.y, Math.abs(r.x2 - r.x1), 1);
    let a: number;
    let b: number;
    if (r.x1 < r.x2) {
      a = r.x1 + 24 * age;
      b = Math.min(a + 24, r.x2);
    } else {
      b = r.x1 - 24 * age;
      a = Math.max(b - 24, r.x2);
    }
    if (a < b) {
      ctx.fillStyle = '#bbffff';
      ctx.fillRect(a, r.y, b - a, 1);
    }
  }
  for (const p of m.projectiles) drawFrame(ctx, sprites, p.type + (p.v > 0 ? 134 : 0), p.x, p.y);
}
