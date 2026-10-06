import type { ButtonId, ButtonLayout, Insets } from '../input/layout';
import type { StickState } from '../input/touch';
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
  ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
  if (m.gameMode === 0) {
    let best = -Infinity;
    for (let i = 1; i < m.numSides; i++) best = Math.max(best, m.score[i]!);
    ctx.fillStyle = SIDE_COLORS[m.sideColors[0] ?? 0]!;
    ctx.fillRect(cx - 36, top, 34, 18);
    ctx.fillStyle = SIDE_COLORS[m.sideColors[1] ?? 1]!;
    ctx.fillRect(cx + 2, top, 34, 18);
    text(ctx, String(m.score[0]), cx - 19, top + 9, 'center');
    text(ctx, String(best === -Infinity ? 0 : best), cx + 19, top + 9, 'center');
    if (m.fragLimit > 0) {
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      text(ctx, `FIRST TO ${m.fragLimit}`, cx, top + 26, 'center');
    }
  } else {
    for (let s = 0; s < 2; s++) {
      ctx.fillStyle = FLAG_COLORS[m.sideColors[s] ?? s]!;
      const x = s === 0 ? cx - 36 : cx + 2;
      ctx.fillRect(x, top, 34, 18);
      text(ctx, String(m.score[s] ?? 0), x + 17, top + 9, 'center');
      if (m.flagIsTaken[s] && (m.tick & 4) === 0) text(ctx, '⚑', x + 17, top + 28, 'center');
    }
    if (m.fragLimit > 0) {
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      text(ctx, `FIRST TO ${m.fragLimit}`, cx, top + 42, 'center');
    }
  }
}

const ORDER_LABELS: Record<string, string> = { order0: 'DEFEND', order1: 'ATTACK', order2: 'FREE' };

/** Line with an arrow head at (x1, y1). */
function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, head: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1 - head * Math.cos(a - 0.6), y1 - head * Math.sin(a - 0.6));
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a + 0.6), y1 - head * Math.sin(a + 0.6));
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke?: string, lw = 2): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Translucent shooter controls: joystick with a knob, round action buttons on an arc, small pills for ally orders. */
export function drawControls(ctx: CanvasRenderingContext2D, layout: ButtonLayout, held: ReadonlySet<ButtonId>, stick: StickState, dpr: number, activeOrder = -1): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = layout.stick;
  circle(ctx, s.cx, s.cy, s.r, 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0.32)');
  circle(ctx, s.cx, s.cy, s.r * 0.58, 'rgba(255,255,255,0)', 'rgba(255,255,255,0.12)', 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const tri = Math.round(s.r * 0.13);
  for (const dir of [-1, 1]) {
    const tx = s.cx + dir * s.r * 0.78;
    ctx.beginPath();
    ctx.moveTo(tx + dir * tri, s.cy);
    ctx.lineTo(tx - dir * tri * 0.7, s.cy - tri);
    ctx.lineTo(tx - dir * tri * 0.7, s.cy + tri);
    ctx.closePath();
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  circle(ctx, s.cx + stick.x, s.cy + stick.y, s.knobR, stick.active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.26)', 'rgba(255,255,255,0.75)');

  for (const b of layout.buttons) {
    const on = held.has(b.id);
    const chosen = b.id === `order${activeOrder}`;
    const fill = chosen ? 'rgba(255,163,26,0.6)' : on ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.16)';
    if (b.shape === 'pill') {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = chosen ? 'rgba(255,200,110,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = chosen ? 2 : 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `700 ${Math.round(b.h * 0.34)}px system-ui, sans-serif`;
      ctx.fillText(ORDER_LABELS[b.id] ?? '', b.x + b.w / 2, b.y + b.h / 2);
      continue;
    }
    circle(ctx, b.cx, b.cy, b.r, fill, 'rgba(255,255,255,0.55)');
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(2, b.r * 0.1);
    ctx.lineCap = 'round';
    switch (b.id) {
      case 'fire':
        circle(ctx, b.cx, b.cy, b.r * 0.5, 'rgba(255,255,255,0)', 'rgba(255,255,255,0.92)');
        circle(ctx, b.cx, b.cy, b.r * 0.2, 'rgba(255,255,255,0.92)');
        break;
      case 'jump':
        ctx.beginPath();
        ctx.moveTo(b.cx - b.r * 0.4, b.cy + b.r * 0.22);
        ctx.lineTo(b.cx, b.cy - b.r * 0.22);
        ctx.lineTo(b.cx + b.r * 0.4, b.cy + b.r * 0.22);
        ctx.stroke();
        break;
      case 'action': {
        // up and down arrows side by side (lift / cycle)
        const k = b.r * 0.5;
        arrow(ctx, b.cx - b.r * 0.25, b.cy + k, b.cx - b.r * 0.25, b.cy - k, b.r * 0.28);
        arrow(ctx, b.cx + b.r * 0.25, b.cy - k, b.cx + b.r * 0.25, b.cy + k, b.r * 0.28);
        break;
      }
      case 'weaponNext': {
        // swap: right arrow over left arrow
        const k = b.r * 0.5;
        arrow(ctx, b.cx - k, b.cy - b.r * 0.22, b.cx + k, b.cy - b.r * 0.22, b.r * 0.3);
        arrow(ctx, b.cx + k, b.cy + b.r * 0.22, b.cx - k, b.cy + b.r * 0.22, b.r * 0.3);
        break;
      }
    }
  }
}

/** Short message pill under the score (e.g. confirming an order to the ally). */
export function drawToast(ctx: CanvasRenderingContext2D, textLine: string, vp: Viewport, safe: Insets, y: number): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.font = '600 13px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(ctx.measureText(textLine).width + 24, vp.w - safe.l - safe.r - 16);
  const x = vp.w / 2 - w / 2;
  ctx.fillStyle = 'rgba(8,10,30,0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(textLine, vp.w / 2, y + 13);
}
