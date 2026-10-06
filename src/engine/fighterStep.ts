import { advanceWeapon, applyPendingWeapon, startFire } from './combat';
import { scanPickups } from './items';
import { effectiveCmd, stepBusy, stepMovement, updateSupport } from './physics';
import type { Fighter, Match } from './types';

/** G_MoveFighter: one tick for a fighter on foot (not on a cycle), in the original's order. */
export function moveFighter(m: Match, f: Fighter, cmd: number): void {
  applyPendingWeapon(m, f);
  const n = effectiveCmd(f, cmd);
  const walked = stepMovement(m, f, n);
  stepBusy(m, f);
  startFire(m, f, n);
  updateSupport(m, f, walked);
  advanceWeapon(m, f);
  scanPickups(m, f, n);
}
