import { describe, expect, it } from 'vitest';
import { computeLayout, type ButtonId, type ButtonLayout } from '../../src/input/layout';
import { createTouchInput } from '../../src/input/touch';

const layout = computeLayout(956, 440, { l: 47, r: 47, t: 0, b: 21 }, true);
const center = (id: ButtonId) => {
  const b = layout.buttons.find((x) => x.id === id)!;
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

function setup(l: ButtonLayout = layout, onOrder?: (o: 0 | 1 | 2) => void) {
  const el = new EventTarget() as unknown as HTMLElement;
  (el as unknown as { getBoundingClientRect(): { left: number; top: number } }).getBoundingClientRect = () => ({ left: 0, top: 0 });
  const input = createTouchInput(el, l, { onOrder });
  const fire = (type: string, id: number, p: { x: number; y: number }) => {
    const e = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: p.x, clientY: p.y });
    el.dispatchEvent(e);
  };
  return { input, fire };
}

describe('touch input', () => {
  it('Fire and Right held by two fingers are both reported', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('right'));
    fire('pointerdown', 2, center('fire'));
    const s = input.state();
    expect(s.right).toBe(true);
    expect(s.fire).toBe(true);
    expect(s.left).toBe(false);
  });

  it('sliding a finger from Right onto Left switches the direction', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('right'));
    expect(input.state().right).toBe(true);
    fire('pointermove', 1, center('left'));
    const s = input.state();
    expect(s.left).toBe(true);
    expect(s.right).toBe(false);
  });

  it('sliding off every button releases it', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('jump'));
    fire('pointermove', 1, { x: 480, y: 120 });
    expect(input.state().jump).toBe(false);
  });

  it('releasing one finger leaves the other held', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('right'));
    fire('pointerdown', 2, center('fire'));
    fire('pointerup', 2, center('fire'));
    const s = input.state();
    expect(s.right).toBe(true);
    expect(s.fire).toBe(false);
  });

  it('a third finger on empty space changes nothing and does not stick', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('right'));
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

  it('releaseAll drops everything (pause, focus loss)', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('fire'));
    fire('pointerdown', 2, center('left'));
    input.releaseAll();
    const s = input.state();
    expect(s.fire || s.left).toBe(false);
  });

  it('weapon buttons are a one-tick pulse', () => {
    const { input, fire } = setup();
    fire('pointerdown', 1, center('weaponNext'));
    expect(input.state().weaponDelta).toBe(1);
    expect(input.state().weaponDelta).toBe(0);
    fire('pointerup', 1, center('weaponNext'));
    fire('pointerdown', 2, center('weaponPrev'));
    expect(input.state().weaponDelta).toBe(-1);
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
  const insets = { l: 47, r: 47, t: 0, b: 21 };
  it('keeps every button inside the safe area', () => {
    for (const [w, h] of [[956, 440], [667, 375], [844, 390]] as const) {
      for (const b of computeLayout(w, h, insets, true).buttons) {
        expect(b.x, `${b.id} ${w}x${h}`).toBeGreaterThanOrEqual(insets.l);
        expect(b.x + b.w).toBeLessThanOrEqual(w - insets.r);
        expect(b.y + b.h).toBeLessThanOrEqual(h - insets.b);
        expect(b.y).toBeGreaterThanOrEqual(insets.t);
      }
    }
  });
  it('hold buttons do not overlap each other', () => {
    const hold = computeLayout(956, 440, insets).buttons.filter((b) => ['left', 'right', 'jump', 'fire', 'action'].includes(b.id));
    for (const a of hold) for (const b of hold) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.id}/${b.id}`).toBe(false);
    }
  });
  it('only adds order buttons when asked', () => {
    expect(computeLayout(956, 440, insets).buttons.some((b) => b.id === 'order0')).toBe(false);
    expect(computeLayout(956, 440, insets, true).buttons.filter((b) => b.id.startsWith('order'))).toHaveLength(3);
  });
});
