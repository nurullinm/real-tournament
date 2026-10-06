import { FIRE_MOMENT, FIRE_SEQ } from './constants';
import { canShoot } from './fighter';
import { applyDamage, emitFx, emitSound } from './lifecycle';
import type { Fighter, Match } from './types';
import { CMD_FIRE } from './types';

const SOUND_BY_WEAPON = ['saw', 'laser', 'bazooka'] as const;
const MAX_PROJECTILES = 20;

/** G_GetShootXLeft: how far a shot from (x, y) travels leftwards (limited by walls and `range`). */
export function shootXLeft(m: Match, x: number, y: number, range: number): number {
  let wall = ((m.reachLeft[y >> 4]?.[x >> 4] ?? 0) << 4) + 16;
  if (wall >= x) wall = x - 1;
  return Math.max(wall, x - range);
}

/** G_GetShootXRight */
export function shootXRight(m: Match, x: number, y: number, range: number): number {
  let wall = (m.reachRight[y >> 4]?.[x >> 4] ?? 0) << 4;
  if (wall <= x) wall = x + 1;
  return Math.min(wall, x + range);
}

/**
 * G_PickTarget: the enemy standing in the shot's span [x1, x2] at height `y`;
 * with several candidates the last one in fighter order wins (as in the original).
 */
export function pickTarget(m: Match, shooter: Fighter, x1: number, x2: number, y: number): Fighter | null {
  let target: Fighter | null = null;
  let far = x2;
  for (let i = 0; i < m.numFighters; i++) {
    const t = m.fighters[i]!;
    if (t.side === shooter.side || t.hp <= 0 || !((t.x < x1) !== (t.x < far)) || y > t.y || y < t.y - 32) continue;
    target = t;
    far = t.x;
  }
  return target;
}

/** Pending weapon switch at the start of the fighter's step. */
export function applyPendingWeapon(m: Match, f: Fighter): void {
  if (f.pendingWeapon < 0 || f.weaponState !== 0) return;
  if (f.pendingWeapon === 0 && !(f.currentWeapon === 0 && f.number !== 0)) emitSound(m, 'spinup', f.x, f.y);
  if (canShoot(f, f.pendingWeapon)) f.currentWeapon = f.pendingWeapon;
  f.pendingWeapon = -1;
}

/** Fire button pressed with an idle weapon: starts the fire/reload sequence. */
export function startFire(m: Match, f: Fighter, cmd: number): void {
  if ((cmd & CMD_FIRE) !== 0 && f.weaponState === 0) {
    f.weaponState = FIRE_SEQ[f.currentWeapon]!.length;
    emitSound(m, SOUND_BY_WEAPON[f.currentWeapon]!, f.x, f.y);
  }
}

function pushRay(m: Match, x1: number, x2: number, y: number, bright: number, dim: number): void {
  m.rays.push({ x1, x2, y, tick: m.tick, bright, dim });
}

function blood(m: Match, x: number, y: number): void {
  if (m.opts.violence) emitFx(m, `blood${m.rng.int(3)}`, x, y);
}

/** Continues the fire sequence; applies the weapon effect on the original's "fire moment" frame. */
export function advanceWeapon(m: Match, f: Fighter): void {
  if (f.weaponState <= 0) return;
  const left = --f.weaponState;
  if (left === FIRE_MOMENT[f.currentWeapon]) {
    switch (f.currentWeapon) {
      case 0: {
        const x = f.x;
        const y = f.y - 16;
        const x2 = f.headsLeft ? shootXLeft(m, x, y, 24) : shootXRight(m, x, y, 24);
        const t = pickTarget(m, f, x, x2, y);
        if (t) {
          applyDamage(m, f.side, t, m.rng.range(20, 50), true, true);
          blood(m, t.x, y);
        }
        break;
      }
      case 1: {
        f.ammo[1]--;
        const y = f.y + (m.assets.muzzleY[f.frame] ?? 0);
        const mx = m.assets.muzzleX[f.frame] ?? 0;
        const x1 = f.headsLeft ? f.x - mx : f.x + mx;
        let x2 = f.headsLeft ? shootXLeft(m, x1, y, 96) : shootXRight(m, x1, y, 96);
        const t = pickTarget(m, f, x1, x2, y);
        if (t) {
          x2 = t.x;
          applyDamage(m, f.side, t, m.rng.range(10, 20), false, true);
          blood(m, x2, y);
        }
        pushRay(m, x1, x2, y, 0xbbffff, 61166);
        break;
      }
      case 2: {
        f.ammo[2]--;
        const y = f.y + (m.assets.muzzleY[f.frame] ?? 0) - 2;
        const mx = m.assets.muzzleX[f.frame] ?? 0;
        const x1 = f.headsLeft ? f.x - mx : f.x + mx;
        const v = f.headsLeft ? -5 : 5;
        const limit = f.headsLeft ? shootXLeft(m, x1, y, 96) : shootXRight(m, x1, y, 96);
        if (m.projectiles.length < MAX_PROJECTILES) m.projectiles.push({ type: 56, x: x1, y, v, owner: f.side, selfLiq: limit });
        break;
      }
    }
  }
  if (left === 0 && !canShoot(f, f.currentWeapon)) {
    const alt = 3 - f.currentWeapon;
    f.currentWeapon = canShoot(f, alt) ? alt : 0;
  }
}

/** G_ThinkProj for one live projectile; returns false when it should be removed. */
function thinkProjectile(m: Match, p: Match['projectiles'][number]): boolean {
  if ((m.tick & 3) === 0) emitFx(m, m.rng.bits(1) === 0 ? 'smoke' : 'smokeLong', p.x, p.y);
  const sy = p.y;
  p.x += p.v;
  const x = p.x;
  if (x < 0 || x > m.mapWidth) return false;
  let hit = false;
  for (let i = 0; i < m.numFighters; i++) {
    const t = m.fighters[i]!;
    if (t.hp <= 0 || t.side === p.owner || Math.abs(t.x - x) >= 6 || sy > t.y || sy < t.y - 32) continue;
    hit = true;
    break;
  }
  if (!(hit || (p.v < 0) !== (x > p.selfLiq))) return true;
  let damage = m.rng.range(60, 100);
  let killed = false;
  for (let i = 0; i < m.numFighters; i++) {
    const t = m.fighters[i]!;
    if (t.hp <= 0) continue;
    let d = Math.abs(x - t.x);
    if (sy <= t.y) {
      if (sy < t.y - 32) d = Math.max(d, t.y - 32 - sy);
    } else {
      d = Math.max(d, sy - t.y);
    }
    if (d >= 22) continue;
    // the original scales the shared damage variable in place, so later victims take cumulatively less
    if (d > 6) damage = Math.trunc((damage * (d - 6)) / 16);
    applyDamage(m, p.owner, t, damage, true, false);
    if (t.hp <= 0) killed = true;
  }
  emitFx(m, 'smokeLong', x, sy - 8);
  emitFx(m, 'explosion', x, sy);
  if (killed) emitSound(m, 'diehard', x, sy);
  emitSound(m, 'explosion', x, sy);
  return false;
}

export function stepProjectiles(m: Match): void {
  m.projectiles = m.projectiles.filter((p) => thinkProjectile(m, p));
}
