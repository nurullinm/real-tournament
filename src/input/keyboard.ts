import type { InputState } from '../engine/types';
import { NO_INPUT } from '../engine/types';

const MAP: Record<string, keyof Pick<InputState, 'left' | 'right' | 'jump' | 'fire' | 'action'>> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump',
  Space: 'fire', KeyF: 'fire', KeyJ: 'fire', ArrowDown: 'action', KeyS: 'action',
};

export interface KeyboardInput {
  state(): InputState;
  releaseAll(): void;
  dispose(): void;
}

/** Desktop/dev controls: arrows or WASD, Space to fire, Q/E or 1-3 for weapons. */
export function createKeyboardInput(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): KeyboardInput {
  const held = new Set<string>();
  let delta: -1 | 0 | 1 = 0;
  let select: -1 | 0 | 1 | 2 = -1;
  const down = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.repeat) return;
    if (k.code === 'KeyQ') delta = -1;
    else if (k.code === 'KeyE') delta = 1;
    else if (k.code === 'Digit1') select = 0;
    else if (k.code === 'Digit2') select = 1;
    else if (k.code === 'Digit3') select = 2;
    if (k.code in MAP) {
      held.add(k.code);
      k.preventDefault();
    }
  };
  const up = (e: Event): void => { held.delete((e as KeyboardEvent).code); };
  const clear = (): void => {
    held.clear();
    delta = 0;
    select = -1;
  };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', clear);
  return {
    state(): InputState {
      const s: InputState = { ...NO_INPUT, weaponDelta: delta, weaponSelect: select };
      for (const code of held) s[MAP[code]!] = true;
      delta = 0;
      select = -1;
      return s;
    },
    releaseAll: clear,
    dispose(): void {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', clear);
    },
  };
}

/** OR-combines held buttons; weapon pulses take whichever source has one. */
export function mergeInputs(a: InputState, b: InputState): InputState {
  return {
    left: a.left || b.left, right: a.right || b.right, jump: a.jump || b.jump, fire: a.fire || b.fire, action: a.action || b.action,
    weaponSelect: a.weaponSelect >= 0 ? a.weaponSelect : b.weaponSelect,
    weaponDelta: a.weaponDelta !== 0 ? a.weaponDelta : b.weaponDelta,
  };
}
