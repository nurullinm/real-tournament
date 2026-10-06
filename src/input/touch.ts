import type { InputState } from '../engine/types';
import { NO_INPUT } from '../engine/types';
import { hitTest, type ButtonId, type ButtonLayout } from './layout';

export interface TouchInput {
  state(): InputState;
  setLayout(layout: ButtonLayout): void;
  /** forget all held buttons (pause, focus loss) */
  releaseAll(): void;
  /** buttons currently held, for drawing pressed states */
  held(): ReadonlySet<ButtonId>;
  dispose(): void;
}

export interface TouchOptions {
  onOrder?(order: 0 | 1 | 2): void;
}

type PointerLike = Event & { pointerId: number; clientX: number; clientY: number };

const HOLD: ReadonlySet<ButtonId> = new Set(['left', 'right', 'jump', 'fire', 'action']);

/** Multitouch controls: each pointer holds at most one button, sliding switches buttons, weapon/order buttons fire once on touch-down. */
export function createTouchInput(el: HTMLElement, initial: ButtonLayout, opts: TouchOptions = {}): TouchInput {
  let layout = initial;
  const pointers = new Map<number, ButtonId | null>();
  let delta: -1 | 0 | 1 = 0;

  const pos = (e: PointerLike): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: Event): void => {
    const ev = e as PointerLike;
    const { x, y } = pos(ev);
    const b = hitTest(layout, x, y);
    if (!b) {
      pointers.set(ev.pointerId, null);
      return;
    }
    el.setPointerCapture?.(ev.pointerId);
    if (b.id === 'weaponPrev') delta = -1;
    else if (b.id === 'weaponNext') delta = 1;
    else if (b.id.startsWith('order')) opts.onOrder?.(Number(b.id.slice(5)) as 0 | 1 | 2);
    pointers.set(ev.pointerId, HOLD.has(b.id) ? b.id : null);
    ev.preventDefault();
  };
  const move = (e: Event): void => {
    const ev = e as PointerLike;
    if (!pointers.has(ev.pointerId)) return;
    const { x, y } = pos(ev);
    const b = hitTest(layout, x, y);
    pointers.set(ev.pointerId, b && HOLD.has(b.id) ? b.id : null);
  };
  const up = (e: Event): void => {
    pointers.delete((e as PointerLike).pointerId);
  };
  const cancel = (): void => pointers.clear();

  const types: [string, (e: Event) => void][] = [
    ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up],
    ['contextmenu', (e) => e.preventDefault()],
  ];
  for (const [t, h] of types) el.addEventListener(t, h);
  const w = (globalThis as { window?: Window }).window;
  w?.addEventListener('blur', cancel);

  const held = (): Set<ButtonId> => new Set([...pointers.values()].filter((v): v is ButtonId => v !== null));
  return {
    state(): InputState {
      const h = held();
      const s: InputState = {
        ...NO_INPUT, left: h.has('left'), right: h.has('right'), jump: h.has('jump'), fire: h.has('fire'), action: h.has('action'),
        weaponDelta: delta,
      };
      delta = 0;
      return s;
    },
    setLayout(l): void {
      layout = l;
    },
    releaseAll: cancel,
    held,
    dispose(): void {
      for (const [t, h] of types) el.removeEventListener(t, h);
      w?.removeEventListener('blur', cancel);
    },
  };
}
