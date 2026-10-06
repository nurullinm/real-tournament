import { COLOR_BLUE, COLOR_RED } from './constants';
import { canShoot, giveAmmo, setHp, setX } from './fighter';
import { emitFx, emitSound, returnFlag, syncPoWindow, takeFlag } from './lifecycle';
import type { Fighter, Match } from './types';
import { CMD_ACTION } from './types';
import { getOnCycle } from './vehicles';

const RESPAWN_TICKS = 250;

/** Pickup scan at the end of G_MoveFighter. `cmd` is the masked command (action bit used for lifts/cycles). */
export function scanPickups(m: Match, f: Fighter, cmd: number): void {
  if (f.hp <= 0) return;
  syncPoWindow(m, f);
  for (let i = f.leftPoM1 + 1; i <= f.rightPo; i++) {
    const p = m.pobjs[i]!;
    const type = p.type;
    if (type < 2) continue;
    if (p.data1 !== f.v && p.data1 + 1 !== f.v) continue;
    switch (type) {
      case 4: {
        const had = canShoot(f, 2);
        if (!giveAmmo(f, 2, 2) && had) return;
        f.weaponPresent[2] = true;
        if (!had) f.pendingWeapon = 2;
        break;
      }
      case 5:
        if (f.hp >= 100) return;
        setHp(f, Math.min(f.hp + 25, 100));
        break;
      case 6: {
        const had = canShoot(f, 2);
        if (!giveAmmo(f, 2, 2)) return;
        if (!had) f.pendingWeapon = 2;
        break;
      }
      case 9:
        if ((cmd & CMD_ACTION) === 0) break;
        m.pobjs[p.data2]!.type = 12;
        p.type = 17;
        break;
      case 16: {
        if ((cmd & CMD_ACTION) === 0 || !f.hasSupport || f.weaponState > 0) break;
        const anchor = p.data3;
        const other = p.data2;
        p.type = 12;
        m.pobjs[other]!.type = 17;
        f.isPassenger = true;
        setX(f, p.x);
        f.liftcar = anchor;
        m.pobjs[anchor]!.data2 = f.number;
        m.pobjs[anchor]!.data3 = 1;
        break;
      }
      case 7:
        if (f.armor >= 100) return;
        f.armor = Math.min(f.armor + 25, 100);
        break;
      case 8: {
        const switchToLaser = f.ammo[1] === 0 && f.currentWeapon === 0;
        if (!giveAmmo(f, 1, 30)) return;
        if (switchToLaser) f.pendingWeapon = 1;
        break;
      }
      case 11:
        if (f.color === COLOR_RED) returnFlag(m, f, true);
        else takeFlag(m, f, i, COLOR_RED);
        return;
      case 10:
        if (f.color === COLOR_BLUE) returnFlag(m, f, true);
        else takeFlag(m, f, i, COLOR_BLUE);
        return;
      case 40:
        if (f.hasSupport && m.tram.state === 0 && m.tram.x === p.x) {
          m.tram.passenger = f.number;
          f.isPassenger = true;
          m.tram.state = p.x === m.tram.x1 ? 2 : 1;
          m.tram.speed = 0;
        }
        return;
      case 2:
      case 3:
        if (!f.hasSupport || (cmd & CMD_ACTION) === 0) return;
        getOnCycle(m, f, i);
        break;
    }
    if (type > 8) continue;
    p.data3 = m.tick + RESPAWN_TICKS;
    p.type |= 0x40;
    m.respawnQueue.push(i);
    // weapons and ammo clack like a reload, health/armor keep the soft chime
    if (f.number === 0) emitSound(m, type === 4 ? 'weapon' : type === 6 || type === 8 ? 'ammo' : 'pickup', f.x, f.y);
  }
}

/** Items whose respawn time has come reappear (queue is FIFO and time-ordered). */
export function stepRespawns(m: Match): void {
  while (m.respawnQueue.length > 0) {
    const i = m.respawnQueue[0]!;
    const p = m.pobjs[i]!;
    if (p.data3 > m.tick) break;
    emitFx(m, 'respawnItem', p.x, p.y);
    emitSound(m, 'itemrespawn', p.x, p.y);
    p.type &= 0x3f;
    m.respawnQueue.shift();
  }
}
