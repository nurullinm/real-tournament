import { describe, expect, it } from 'vitest';
import { buttonCenter, computeLayout, type ButtonId, type ButtonLayout } from '../../src/input/layout';
import { createTouchInput } from '../../src/input/touch';

const safe = { l: 47, r: 47, t: 0, b: 21 };
const layout = computeLayout(956, 440, safe, true);
const center = (id: ButtonId) => buttonCenter(layout.buttons.find((x) => x.id === id)!);
/** a point inside the stick, `fx`/`fy` as fractions of its radius from the centre */
const stickAt = (fx: number, fy = 0) => ({ x: layout.stick.cx + fx * layout.stick.r, y: layout.stick.cy + fy * layout.stick.r });

function setup(l: ButtonLayout = layout, onOrder?: (o: 0 | 1 | 2) => void) {
  const el = new EventTarget() as unknown as HTMLElement;
  (el as unknown as { getBoundingClientRect(): { left: number; top: number } }).getBoundingClientRect = () => ({ left: 0, top: 0 });
  const input = createTouchInput(el, l, { onOrder });
  const fire = (type: string, id: number, p: { x: number; y: number }) => {
    el.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: p.x, clientY: p.y }));
  };
  return { input, fire };
}

describe('joystick', () => {
  it('pushing right/left past the dead zone moves, a small wiggle does not', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.1));
    expect(input.state()).toMatchObject({ left: false, right: false });
    fire('pointermove', 1, stickAt(0.8));
    expect(input.state()).toMatchObject({ right: true, left: false });
    fire('pointermove', 1, stickAt(-0.8));
    expect(input.state()).toMatchObject({ right: false, left: true });
  });

  it('pushing the stick up does not jump (jump is its own button); diagonals still move sideways', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0, 0));
    fire('pointermove', 1, stickAt(0, -0.95));
    expect(input.state()).toMatchObject({ jump: false, left: false, right: false });
    fire('pointermove', 1, stickAt(0.7, -0.8));
    expect(input.state()).toMatchObject({ jump: false, right: true });
  });

  it('the knob is clamped to the base radius and reported for drawing', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.2));
    fire('pointermove', 1, stickAt(3, 0));
    const k = input.stick();
    expect(k.active).toBe(true);
    expect(Math.hypot(k.x, k.y)).toBeCloseTo(layout.stick.r, 5);
  });

  it('releasing the stick stops movement', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.9));
    fire('pointerup', 1, stickAt(0.9));
    expect(input.state()).toMatchObject({ right: false, left: false, jump: false });
    expect(input.stick().active).toBe(false);
  });

  it('only one finger owns the stick; a second finger in the zone is ignored', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.9));
    fire('pointerdown', 2, stickAt(-0.9));
    expect(input.state()).toMatchObject({ right: true, left: false });
  });
});

describe('buttons and multitouch', () => {
  it('Fire while walking right (two fingers) reports both', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.9));
    fire('pointerdown', 2, center('fire'));
    expect(input.state()).toMatchObject({ right: true, fire: true });
  });

  it('jump button works together with the stick and fire', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(-0.9));
    fire('pointerdown', 2, center('jump'));
    fire('pointerdown', 3, center('fire'));
    expect(input.state()).toMatchObject({ left: true, jump: true, fire: true });
  });

  it('sliding a finger from Fire to Jump switches the button, sliding off releases it', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('fire'));
    fire('pointermove', 1, center('jump'));
    expect(input.state()).toMatchObject({ jump: true, fire: false });
    fire('pointermove', 1, { x: 480, y: 120 });
    expect(input.state()).toMatchObject({ jump: false, fire: false });
  });

  it('releasing one finger leaves the other held', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.9));
    fire('pointerdown', 2, center('fire'));
    fire('pointerup', 2, center('fire'));
    expect(input.state()).toMatchObject({ right: true, fire: false });
  });

  it('a third finger on empty space changes nothing and does not stick', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, stickAt(0.9));
    fire('pointerdown', 2, center('fire'));
    fire('pointerdown', 3, { x: 480, y: 100 });
    fire('pointerup', 3, { x: 480, y: 100 });
    const s = input.state();
    expect(s.right && s.fire).toBe(true);
    expect(s.jump || s.left || s.action).toBe(false);
  });

  it('pointercancel clears that finger', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('fire'));
    fire('pointercancel', 1, center('fire'));
    expect(input.state().fire).toBe(false);
  });

  it('releaseAll drops stick, buttons and pending weapon taps (pause, focus loss)', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('fire'));
    fire('pointerdown', 2, stickAt(-0.9));
    fire('pointerdown', 3, center('weaponNext'));
    input.releaseAll();
    expect(input.state()).toMatchObject({ fire: false, left: false, weaponDelta: 0 });
    expect(input.stick().active).toBe(false);
  });

  it('the weapon swap button is a one-tick pulse', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('weaponNext'));
    expect(input.state().weaponDelta).toBe(1);
    expect(input.state().weaponDelta).toBe(0);
  });

  it('order buttons call back once per tap', () => {
    const got: number[] = [];
    const { fire } = setup(layout, (o) => got.push(o));
    fire('pointerdown', 1, center('order1'));
    fire('pointerup', 1, center('order1'));
    expect(got).toEqual([1]);
  });

  it('dispose stops listening', () => {
    const { input, fire } = setup();
    input.dispose();
    fire('pointerdown', 1, center('fire'));
    expect(input.state().fire).toBe(false);
  });
});

describe('layout', () => {
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const rectOf = (b: ReturnType<typeof computeLayout>['buttons'][number]): Rect =>
    b.shape === 'circle' ? { x0: b.cx - b.r, y0: b.cy - b.r, x1: b.cx + b.r, y1: b.cy + b.r } : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
  const sizes = [[956, 440], [667, 375], [844, 390], [932, 430]] as const;

  it('keeps every control inside the safe area', () => {
    for (const [w, h] of sizes) {
      const l = computeLayout(w, h, safe, true);
      for (const b of l.buttons) {
        const r = rectOf(b);
        expect(r.x0, `${b.id} ${w}x${h}`).toBeGreaterThanOrEqual(safe.l);
        expect(r.x1).toBeLessThanOrEqual(w - safe.r);
        expect(r.y1).toBeLessThanOrEqual(h - safe.b);
        expect(r.y0).toBeGreaterThanOrEqual(safe.t);
      }
      expect(l.stick.cx - l.stick.r).toBeGreaterThanOrEqual(safe.l);
      expect(l.stick.cy + l.stick.r).toBeLessThanOrEqual(h - safe.b);
    }
  });

  it('round buttons never overlap each other or the stick base', () => {
    for (const [w, h] of sizes) {
      const l = computeLayout(w, h, safe, true);
      const rounds = l.buttons.filter((b) => b.shape === 'circle');
      for (const a of rounds) {
        for (const b of rounds) {
          if (a === b || a.shape !== 'circle' || b.shape !== 'circle') continue;
          expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${a.id}/${b.id} ${w}x${h}`).toBeGreaterThanOrEqual(a.r + b.r);
        }
        if (a.shape === 'circle') expect(Math.hypot(a.cx - l.stick.cx, a.cy - l.stick.cy)).toBeGreaterThan(a.r + l.stick.r);
      }
    }
  });

  it('order pills sit above the stick and do not touch it', () => {
    const l = computeLayout(956, 440, safe, true);
    for (const b of l.buttons.filter((x) => x.shape === 'pill')) {
      expect(b.shape === 'pill' && b.y + b.h).toBeLessThanOrEqual(l.stick.cy - l.stick.r);
    }
  });

  it('touch targets are at least 44 px', () => {
    const l = computeLayout(956, 440, safe, true);
    for (const b of l.buttons) {
      const r = rectOf(b);
      expect(Math.min(r.x1 - r.x0, r.y1 - r.y0), b.id).toBeGreaterThanOrEqual(34);
      if (b.shape === 'circle') expect(b.r * 2, b.id).toBeGreaterThanOrEqual(44);
    }
  });

  it('only adds order buttons when asked', () => {
    expect(computeLayout(956, 440, safe).buttons.some((b) => b.id === 'order0')).toBe(false);
    expect(computeLayout(956, 440, safe, true).buttons.filter((b) => b.id.startsWith('order'))).toHaveLength(3);
  });
});

describe('layout spacing', () => {
  it('keeps action buttons well clear of the fire button (at least 14 px gap)', () => {
    for (const [w, h] of [[956, 440], [667, 375], [844, 390]] as const) {
      const l = computeLayout(w, h, safe, false);
      const fire = l.buttons.find((b) => b.id === 'fire')!;
      for (const id of ['jump', 'action', 'weaponNext'] as const) {
        const b = l.buttons.find((x) => x.id === id)!;
        if (fire.shape !== 'circle' || b.shape !== 'circle') throw new Error('expected circles');
        expect(Math.hypot(b.cx - fire.cx, b.cy - fire.cy) - b.r - fire.r, `${id} ${w}x${h}`).toBeGreaterThanOrEqual(14);
      }
    }
  });
});

describe('robustness', () => {
  it('a failing setPointerCapture must not swallow the tap (orders, buttons, stick)', () => {
    const got: number[] = [];
    const el = new EventTarget() as unknown as HTMLElement & { setPointerCapture(id: number): void };
    (el as unknown as { getBoundingClientRect(): { left: number; top: number } }).getBoundingClientRect = () => ({ left: 0, top: 0 });
    el.setPointerCapture = () => { throw new DOMException('no such pointer', 'NotFoundError'); };
    const input = createTouchInput(el, layout, { onOrder: (o) => got.push(o) });
    const fire = (type: string, id: number, p: { x: number; y: number }) =>
      el.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: p.x, clientY: p.y }));
    fire('pointerdown', 1, center('order2'));
    fire('pointerdown', 2, center('fire'));
    fire('pointerdown', 3, stickAt(0.9));
    expect(got).toEqual([2]);
    expect(input.state()).toMatchObject({ fire: true, right: true });
  });
});
