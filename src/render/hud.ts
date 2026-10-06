import type { ButtonLayout, ButtonId } from '../input/layout';
import type { Insets } from '../input/layout';
import type { Match } from '../engine/types';

export interface Viewport {
  /** CSS pixels */
  w: number;
  h: number;
  dpr: number;
}

const SIDE_COLORS = ['#3a5bff', '#e03030', '#25b25a', '#d9b800'];
const FLAG_COLORS = ['#4444ff', '#ff4444'];
const WEAPON_NAMES = ['SAW', 'LASER', 'BAZOOKA'];

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, Math.max(0, frac))), h - 2);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, align: CanvasTextAlign = 'left'): void {
  ctx.textAlign = align;
  ctx.fillStyle = '#fff';
  ctx.fillText(s, x, y);
}

/** Vector HUD in CSS px over the world: health, armor, weapon/ammo (left), frags or flags (centre). */
export function drawHud(ctx: CanvasRenderingContext2D, m: Match, playerId: number, vp: Viewport, safe: Insets): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  const p = m.fighters[playerId]!;
  const left = safe.l + 12;
  const top = safe.t + 10;
  ctx.font = '600 16px ui-rounded, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  bar(ctx, left, top, 120, 14, p.hp / 100, '#e5484d');
  text(ctx, String(Math.max(0, p.hp)), left + 126, top + 7);
  bar(ctx, left, top + 20, 120, 10, p.armor / 100, '#46a3ff');
  text(ctx, String(p.armor), left + 126, top + 25);
  const ammo = p.currentWeapon === 0 ? '∞' : String(p.ammo[p.currentWeapon]);
  text(ctx, `${WEAPON_NAMES[p.currentWeapon] ?? ''}  ${ammo}`, left, top + 46);

  const cx = vp.w / 2;
  ctx.font = '700 20px ui-rounded, system-ui, sans-serif';
  if (m.gameMode === 0) {
    let best = -Infinity;
    for (let i = 1; i < m.numSides; i++) best = Math.max(best, m.score[i]!);
    ctx.fillStyle = SIDE_COLORS[m.sideColors[0] ?? 0]!;
    ctx.fillRect(cx - 62, top, 56, 24);
    ctx.fillStyle = SIDE_COLORS[m.sideColors[1] ?? 1]!;
    ctx.fillRect(cx + 6, top, 56, 24);
    text(ctx, String(m.score[0]), cx - 34, top + 12, 'center');
    text(ctx, String(best === -Infinity ? 0 : best), cx + 34, top + 12, 'center');
    if (m.fragLimit > 0) {
      ctx.font = '600 12px ui-rounded, system-ui, sans-serif';
      text(ctx, `FIRST TO ${m.fragLimit}`, cx, top + 36, 'center');
    }
  } else {
    for (let s = 0; s < 2; s++) {
      ctx.fillStyle = FLAG_COLORS[m.sideColors[s] ?? s]!;
      const x = s === 0 ? cx - 62 : cx + 6;
      ctx.fillRect(x, top, 56, 24);
      text(ctx, String(m.score[s] ?? 0), x + 28, top + 12, 'center');
      if (m.flagIsTaken[s] && (m.tick & 4) === 0) text(ctx, '⚑', x + 28, top + 40, 'center');
    }
    if (m.fragLimit > 0) {
      ctx.font = '600 12px ui-rounded, system-ui, sans-serif';
      text(ctx, `FIRST TO ${m.fragLimit}`, cx, top + 62, 'center');
    }
  }
}

const LABELS: Record<ButtonId, string> = {
  left: '◀', right: '▶', jump: '▲', fire: '●', action: '⇅', weaponPrev: '‹', weaponNext: '›',
  order0: 'DEFEND', order1: 'ATTACK', order2: 'FREE',
};

/** Translucent on-screen controls; pressed buttons light up. */
export function drawControls(ctx: CanvasRenderingContext2D, layout: ButtonLayout, held: ReadonlySet<ButtonId>, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of layout.buttons) {
    const on = held.has(b.id);
    ctx.fillStyle = on ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(b.w, b.h) / 2.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${Math.round(Math.min(b.w, b.h) * (b.id.startsWith('order') ? 0.28 : 0.42))}px system-ui, sans-serif`;
    ctx.fillText(LABELS[b.id], b.x + b.w / 2, b.y + b.h / 2);
  }
}
