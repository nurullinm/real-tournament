export type ButtonId = 'jump' | 'fire' | 'action' | 'weaponNext' | 'order0' | 'order1' | 'order2';

export interface RoundButton {
  id: ButtonId;
  shape: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface PillButton {
  id: ButtonId;
  shape: 'pill';
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Button = RoundButton | PillButton;

/** Virtual joystick: a fixed base in the bottom-left corner; touching within `zone` of its centre grabs the knob. */
export interface StickLayout {
  cx: number;
  cy: number;
  /** base radius = full deflection */
  r: number;
  /** engagement radius (a little larger than the visible base) */
  zone: number;
  knobR: number;
}

export interface ButtonLayout {
  stick: StickLayout;
  buttons: Button[];
}

export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

const DEG = Math.PI / 180;

/**
 * Landscape shooter layout (CSS px): joystick bottom-left; big fire button in the bottom-right corner with jump, action
 * and weapon-swap on an arc around it, well clear of the fire button; ally orders as small pills above the joystick (CTF 2v2 only).
 */
export function computeLayout(w: number, h: number, safe: Insets, withOrders = false): ButtonLayout {
  const unit = Math.min(Math.max(h / 440, 0.8), 1.15);
  const R = Math.round(58 * unit);
  const stick: StickLayout = {
    cx: safe.l + 22 + R,
    cy: h - safe.b - 18 - R,
    r: R,
    zone: R + 26,
    knobR: Math.round(26 * unit),
  };
  const fireR = Math.round(42 * unit);
  const fx = w - safe.r - 22 - fireR;
  const fy = h - safe.b - 18 - fireR;
  const onArc = (id: ButtonId, r: number, dist: number, deg: number): RoundButton => ({
    id, shape: 'circle', r, cx: Math.round(fx + dist * Math.cos(deg * DEG)), cy: Math.round(fy - dist * Math.sin(deg * DEG)),
  });
  const jumpR = Math.round(30 * unit);
  const actionR = Math.round(30 * unit);
  const swapR = Math.round(22 * unit);
  const buttons: Button[] = [
    { id: 'fire', shape: 'circle', cx: fx, cy: fy, r: fireR },
    onArc('jump', jumpR, fireR + jumpR + 22, 162),
    onArc('action', actionR, fireR + actionR + 22, 112),
    onArc('weaponNext', swapR, fireR + swapR + 40, 72),
  ];
  if (withOrders) {
    const pw = Math.round(54 * unit);
    const ph = Math.round(34 * unit);
    for (let i = 0; i < 3; i++) {
      buttons.push({ id: `order${i}` as ButtonId, shape: 'pill', x: safe.l + 22 + i * (pw + 6), y: stick.cy - R - 14 - ph, w: pw, h: ph });
    }
  }
  return { stick, buttons };
}

function distanceTo(b: Button, x: number, y: number): number {
  if (b.shape === 'circle') return Math.max(0, Math.hypot(x - b.cx, y - b.cy) - b.r);
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Finger-friendly hit test: inside a button, or within `slop` px of the nearest one. */
export function hitTest(layout: ButtonLayout, x: number, y: number, slop = 8): Button | null {
  let best: Button | null = null;
  let bestD = Infinity;
  for (const b of layout.buttons) {
    const d = distanceTo(b, x, y);
    if (d <= slop && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

export function inStickZone(layout: ButtonLayout, x: number, y: number): boolean {
  const s = layout.stick;
  return Math.hypot(x - s.cx, y - s.cy) <= s.zone;
}

export function buttonCenter(b: Button): { x: number; y: number } {
  return b.shape === 'circle' ? { x: b.cx, y: b.cy } : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
