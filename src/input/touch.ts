import type { InputState } from '../engine/types';
import { NO_INPUT } from '../engine/types';
import { hitTest, inStickZone, type ButtonId, type ButtonLayout } from './layout';

export interface StickState {
  active: boolean;
  /** knob offset from the base centre in CSS px, already clamped to the base radius */
  x: number;
  y: number;
}

export interface TouchInput {
  state(): InputState;
  setLayout(layout: ButtonLayout): void;
  /** forget all held buttons and the stick (pause, focus loss) */
  releaseAll(): void;
  /** buttons currently held, for drawing pressed states */
  held(): ReadonlySet<ButtonId>;
  stick(): StickState;
  dispose(): void;
}

export interface TouchOptions {
  onOrder?(order: 0 | 1 | 2): void;
}

type PointerLike = Event & { pointerId: number; clientX: number; clientY: number };

const HOLD: ReadonlySet<ButtonId> = new Set(['jump', 'fire', 'action']);
/** fraction of the base radius the knob must travel before it counts */
const DEAD_ZONE = 0.28;

type Pointer = { kind: 'none' } | { kind: 'button'; id: ButtonId } | { kind: 'stick'; x: number; y: number };

/**
 * Multitouch shooter controls: a joystick (left/right only) plus hold buttons. Each pointer owns at most one
 * control; sliding off a button releases it; weapon swap and order buttons fire once on touch-down.
 */
export function createTouchInput(el: HTMLElement, initial: ButtonLayout, opts: TouchOptions = {}): TouchInput {
  let layout = initial;
  const pointers = new Map<number, Pointer>();
  let delta: -1 | 0 | 1 = 0;

  const pos = (e: PointerLike): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stickOwner = (): number | undefined => [...pointers].find(([, p]) => p.kind === 'stick')?.[0];
  const knob = (x: number, y: number): { x: number; y: number } => {
    const s = layout.stick;
    let dx = x - s.cx;
    let dy = y - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > s.r) {
      dx = (dx / len) * s.r;
      dy = (dy / len) * s.r;
    }
    return { x: dx, y: dy };
  };

  /** capture keeps drags working outside the canvas, but a failure (stale pointer, odd WebView) must never eat the tap */
  const capture = (id: number): void => {
    try {
      el.setPointerCapture?.(id);
    } catch {
      /* ignore */
    }
  };

  const down = (e: Event): void => {
    const ev = e as PointerLike;
    const { x, y } = pos(ev);
    const b = hitTest(layout, x, y);
    if (b) {
      capture(ev.pointerId);
      if (b.id === 'weaponNext') delta = 1;
      else if (b.id.startsWith('order')) opts.onOrder?.(Number(b.id.slice(5)) as 0 | 1 | 2);
      pointers.set(ev.pointerId, HOLD.has(b.id) ? { kind: 'button', id: b.id } : { kind: 'none' });
      ev.preventDefault();
      return;
    }
    if (inStickZone(layout, x, y) && stickOwner() === undefined) {
      capture(ev.pointerId);
      pointers.set(ev.pointerId, { kind: 'stick', ...knob(x, y) });
      ev.preventDefault();
      return;
    }
    pointers.set(ev.pointerId, { kind: 'none' });
  };
  const move = (e: Event): void => {
    const ev = e as PointerLike;
    const cur = pointers.get(ev.pointerId);
    if (!cur) return;
    const { x, y } = pos(ev);
    if (cur.kind === 'stick') {
      pointers.set(ev.pointerId, { kind: 'stick', ...knob(x, y) });
      return;
    }
    const b = hitTest(layout, x, y);
    pointers.set(ev.pointerId, b && HOLD.has(b.id) ? { kind: 'button', id: b.id } : { kind: 'none' });
  };
  const up = (e: Event): void => {
    pointers.delete((e as PointerLike).pointerId);
  };
  const cancel = (): void => {
    pointers.clear();
    delta = 0; // a weapon tap made just before a pause must not fire on resume
  };

  const types: [string, (e: Event) => void][] = [
    ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up],
    ['contextmenu', (e) => e.preventDefault()],
  ];
  for (const [t, h] of types) el.addEventListener(t, h);
  const w = (globalThis as { window?: Window }).window;
  w?.addEventListener('blur', cancel);

  const held = (): Set<ButtonId> => {
    const out = new Set<ButtonId>();
    for (const p of pointers.values()) if (p.kind === 'button') out.add(p.id);
    return out;
  };
  const stick = (): StickState => {
    for (const p of pointers.values()) if (p.kind === 'stick') return { active: true, x: p.x, y: p.y };
    return { active: false, x: 0, y: 0 };
  };
  return {
    state(): InputState {
      const h = held();
      const s = stick();
      const nx = s.active ? s.x / layout.stick.r : 0;
      const out: InputState = {
        ...NO_INPUT,
        left: nx < -DEAD_ZONE, right: nx > DEAD_ZONE, jump: h.has('jump'), fire: h.has('fire'), action: h.has('action'),
        weaponDelta: delta,
      };
      delta = 0;
      return out;
    },
    setLayout(l): void {
      layout = l;
    },
    releaseAll: cancel,
    held,
    stick,
    dispose(): void {
      for (const [t, h] of types) el.removeEventListener(t, h);
      w?.removeEventListener('blur', cancel);
    },
  };
}
