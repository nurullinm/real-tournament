import { describe, expect, it } from 'vitest';
import { createKeyboardInput, mergeInputs } from '../../src/input/keyboard';
import { NO_INPUT } from '../../src/engine/types';

function setup() {
  const t = new EventTarget();
  const kb = createKeyboardInput(t as unknown as Window);
  const key = (type: string, code: string, repeat = false) => t.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat }));
  return { kb, key, t };
}

describe('keyboard input', () => {
  it('reports held keys and releases them', () => {
    const { kb, key } = setup();
    key('keydown', 'ArrowRight');
    key('keydown', 'Space');
    expect(kb.state()).toMatchObject({ right: true, fire: true, left: false });
    key('keyup', 'ArrowRight');
    expect(kb.state()).toMatchObject({ right: false, fire: true });
  });
  it('weapon keys are one-tick pulses', () => {
    const { kb, key } = setup();
    key('keydown', 'KeyE');
    key('keydown', 'Digit3');
    expect(kb.state()).toMatchObject({ weaponDelta: 1, weaponSelect: 2 });
    expect(kb.state()).toMatchObject({ weaponDelta: 0, weaponSelect: -1 });
  });
  it('ignores auto-repeat for pulses and unknown keys', () => {
    const { kb, key } = setup();
    key('keydown', 'KeyE', true);
    key('keydown', 'KeyZ');
    expect(kb.state()).toEqual(NO_INPUT);
  });
  it('releaseAll and dispose stop input', () => {
    const { kb, key } = setup();
    key('keydown', 'ArrowUp');
    kb.releaseAll();
    expect(kb.state().jump).toBe(false);
    kb.dispose();
    key('keydown', 'ArrowUp');
    expect(kb.state().jump).toBe(false);
  });
});

describe('mergeInputs', () => {
  it('ORs held buttons and keeps whichever weapon pulse exists', () => {
    const a = { ...NO_INPUT, left: true, weaponDelta: -1 as const };
    const b = { ...NO_INPUT, fire: true, weaponSelect: 2 as const };
    expect(mergeInputs(a, b)).toMatchObject({ left: true, fire: true, weaponDelta: -1, weaponSelect: 2 });
  });
});
