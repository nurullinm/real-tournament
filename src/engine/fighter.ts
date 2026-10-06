import { COLOR_BLUE } from './constants';
import type { Fighter } from './types';
import { MAX_AMMO } from './types';

export function createFighter(number: number): Fighter {
  return {
    number, side: 0, color: 0, flagBaseLeft: 0, flagBaseRight: 0, starts: [],
    x: 0, y: 0, u: 0, v: 0, xspeed: 0, yspeedFix: 0, hasSupport: false, liftcar: -1,
    headsLeft: false, jumpThrust: false, frame: 0, leftPoM1: -1, rightPo: -1,
    hp: 0, armor: 0, isCycling: false, isPassenger: false, isCarrying: false,
    ammo: [0, 0, 0], weaponPresent: [true, true, false], currentWeapon: 1, pendingWeapon: -1, weaponState: 0,
    busySequence: null, busyIndex: 0, aiJumpDestX: 0, aiIgnoreChasers: false,
    aiCycleDestX: 0, aiCycleDestY: 0, aiNodeBehind: 0, aiNodeAhead: 0, aiColorFlag: 1, aiOrder: 0, frags: 0,
  };
}

export const setX = (f: Fighter, x: number): void => { f.x = x; f.u = x >> 4; };
export const setY = (f: Fighter, y: number): void => { f.y = y; f.v = y >> 4; };
export const setHp = (f: Fighter, hp: number): void => { f.hp = hp; };
export const setSpeed = (f: Fighter, n: number): void => { f.xspeed = f.headsLeft ? -n : n; };
export const setColor = (f: Fighter, c: number): void => { f.color = c; f.aiColorFlag = 1 << c; };

export function setBusy(f: Fighter, seq: readonly number[]): void {
  if (seq === f.busySequence) return;
  f.busySequence = seq;
  f.busyIndex = seq.length;
}

export function cycleFrame(f: Fighter, lo: number, hi: number): void {
  f.frame++;
  if (f.frame < lo || f.frame > hi) f.frame = lo;
}

export const canShoot = (f: Fighter, w: number): boolean => w === 0 || (!!f.weaponPresent[w] && (f.ammo[w] ?? 0) > 0);

export function giveAmmo(f: Fighter, w: 1 | 2, n: number): boolean {
  const max = MAX_AMMO[w];
  if (f.ammo[w] >= max) return false;
  f.ammo[w] = Math.min(f.ammo[w] + n, max);
  return true;
}

export const isBlue = (f: Fighter): boolean => f.color === COLOR_BLUE;
