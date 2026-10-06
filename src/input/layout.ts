export type ButtonId = 'left' | 'right' | 'jump' | 'fire' | 'action' | 'weaponPrev' | 'weaponNext' | 'order0' | 'order1' | 'order2';

export interface Button {
  id: ButtonId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ButtonLayout {
  buttons: Button[];
}

export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

const MARGIN = 16;
const GAP = 12;

/** Landscape thumb layout in CSS px: movement bottom-left, fire/jump/action bottom-right, weapon and order buttons up top. */
export function computeLayout(w: number, h: number, safe: Insets, withOrders = false): ButtonLayout {
  const btn = Math.round(Math.min(h * 0.26, 104));
  const big = Math.round(btn * 1.25);
  const small = Math.round(btn * 0.6);
  const bottom = h - safe.b - MARGIN;
  const leftX = safe.l + MARGIN;
  const rightEdge = w - safe.r - MARGIN;
  const fire: Button = { id: 'fire', x: rightEdge - big, y: bottom - big, w: big, h: big };
  const buttons: Button[] = [
    { id: 'left', x: leftX, y: bottom - btn, w: btn, h: btn },
    { id: 'right', x: leftX + btn + GAP, y: bottom - btn, w: btn, h: btn },
    fire,
    { id: 'jump', x: fire.x - btn - GAP, y: bottom - btn, w: btn, h: btn },
    { id: 'action', x: fire.x + Math.round((big - btn) / 2), y: fire.y - btn - GAP, w: btn, h: btn },
    { id: 'weaponPrev', x: rightEdge - 2 * small - GAP, y: safe.t + 56, w: small, h: small },
    { id: 'weaponNext', x: rightEdge - small, y: safe.t + 56, w: small, h: small },
  ];
  if (withOrders) {
    for (let i = 0; i < 3; i++) {
      buttons.push({ id: `order${i}` as ButtonId, x: leftX, y: safe.t + 84 + i * (small + 6), w: Math.round(small * 1.9), h: Math.round(small * 0.85) });
    }
  }
  return { buttons };
}

/** Distance from point to rect (0 inside). */
function distance(b: Button, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Finger-friendly hit test: inside a button, or within `slop` px of the nearest one. */
export function hitTest(layout: ButtonLayout, x: number, y: number, slop = 12): Button | null {
  let best: Button | null = null;
  let bestD = Infinity;
  for (const b of layout.buttons) {
    const d = distance(b, x, y);
    if (d <= slop && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}
