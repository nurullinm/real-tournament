import { BRAKE_DISTANCE } from './types';
import { SEQ_DIE, SEQ_DIE_SQUISHED } from './constants';
import { pickTarget, shootXLeft, shootXRight } from './combat';
import { setBusy, setX, setY } from './fighter';
import { applyDamage, emitFx, emitSound, killFighterCommon, respawnFighter, syncPoWindow } from './lifecycle';
import type { Fighter, Match } from './types';
import { CMD_FIRE, CMD_LEFT, CMD_RIGHT } from './types';

const brake = (speed: number): number => BRAKE_DISTANCE[Math.max(0, Math.min(15, speed))]!;

/** Lift state machine from G_AdvanceGame (thinkers). Types: 1 idle anchor, 18 down, 19 up, 12-15 stop transitions, 16 car present. */
export function stepLifts(m: Match): void {
  const po = m.pobjs;
  for (const n of m.thinkers) {
    const p = po[n]!;
    switch (p.type) {
      case 19: {
        const top = po[n + 1]!.y;
        p.y -= p.data3;
        const dist = p.y - top;
        if (dist < 0) {
          p.y = top;
          p.type = 1;
          po[n + 1]!.type = 14;
        } else if (dist < brake(p.data3)) {
          p.data3--;
        } else if (p.data3 < 14) {
          p.data3++;
        }
        if (p.data2 >= 0) setY(m.fighters[p.data2]!, p.y);
        break;
      }
      case 18: {
        const bottom = po[n + 2]!.y;
        p.y += p.data3;
        const dist = bottom - p.y;
        if (dist < 0) {
          p.y = bottom;
          p.type = 1;
          po[n + 2]!.type = 14;
        }
        if (dist < brake(p.data3)) p.data3--;
        else if (p.data3 < 14) p.data3++;
        if (p.data2 >= 0) setY(m.fighters[p.data2]!, p.y);
        break;
      }
      case 12:
        p.type = 13;
        break;
      case 13: {
        p.type = 17;
        const anchor = p.data3;
        po[anchor]!.type = anchor === n - 1 ? 18 : 19;
        break;
      }
      case 14:
        p.type = 15;
        break;
      case 15: {
        p.type = 16;
        po[p.data2]!.type = 9;
        const anchor = p.data3;
        const riderIdx = po[anchor]!.data2;
        if (riderIdx < 0) break;
        const rider = m.fighters[riderIdx]!;
        rider.isPassenger = false;
        po[anchor]!.data2 = -1;
        m.ai.makeDecision(m, rider);
        rider.liftcar = -1;
        break;
      }
    }
  }
}

/** G_Tram_Squish: grounded fighters on the tram's track when it arrives are crushed. */
function tramSquish(m: Match): void {
  const t = m.tram;
  for (let i = 0; i < 4; i++) {
    const f = m.fighters[i]!;
    if (f.isPassenger || !f.hasSupport || f.y !== t.y || Math.abs(f.x - t.x) >= 39 || f.hp <= 0) continue;
    killFighterCommon(m, f.side, f, true);
    emitSound(m, 'die', f.x, f.y);
    if (m.opts.violence) {
      setBusy(f, SEQ_DIE_SQUISHED);
    } else {
      setX(f, t.x === t.x1 ? t.x1 - 39 : t.x2 + 39);
      setBusy(f, SEQ_DIE);
    }
  }
}

/** Tram state machine: 0 waiting, 1 moving left, 2 moving right, 3 arrived. */
export function stepTram(m: Match): void {
  const t = m.tram;
  if (t.y <= 0) return;
  const rider = t.passenger >= 0 ? m.fighters[t.passenger]! : null;
  switch (t.state) {
    case 2: {
      t.x += t.speed;
      const dist = t.x2 - t.x;
      if (dist < 0) {
        t.x = t.x2;
        t.state = 3;
        tramSquish(m);
      }
      if (dist < brake(t.speed)) t.speed--;
      else if (t.speed < 14) t.speed++;
      if (rider) setX(rider, t.x);
      break;
    }
    case 1: {
      t.x -= t.speed;
      const dist = t.x - t.x1;
      if (dist < 0) {
        t.x = t.x1;
        t.state = 3;
        tramSquish(m);
      }
      if (dist < brake(t.speed)) t.speed--;
      else if (t.speed < 14) t.speed++;
      if (rider) setX(rider, t.x);
      break;
    }
    case 3:
      if (rider) {
        rider.isPassenger = false;
        setX(rider, t.x === t.x1 ? t.x1 - 39 : t.x2 + 39);
        m.ai.makeDecision(m, rider);
        t.passenger = -1;
      }
      t.state = 0;
      t.speed = m.rng.range(30, 150);
      break;
    default:
      if (--t.speed === 0) t.state = t.x === t.x1 ? 2 : 1;
  }
}

/** G_GetOnCycle: mount the cycle docked at pobj `pobjIdx`. */
export function getOnCycle(m: Match, f: Fighter, pobjIdx: number): void {
  const c = m.cycle!;
  const p = m.pobjs[pobjIdx]!;
  const rightSide = p.x > c.x2;
  f.isCycling = true;
  f.xspeed = 0;
  f.yspeedFix = 0;
  f.x = p.x + (rightSide ? 16 : -16);
  f.headsLeft = rightSide;
  f.weaponState = 0;
  f.aiNodeAhead = -1;
  m.ai.setCycleDestination(m, f);
}

/** G_GetFromCycle: dismount at dock pobj `pobjIdx` / AI node `node`. */
export function getFromCycle(m: Match, f: Fighter, pobjIdx: number, node: number): void {
  const c = m.cycle!;
  const p = m.pobjs[pobjIdx]!;
  const leftSide = p.x < c.x1;
  f.aiNodeBehind = f.aiNodeAhead = node;
  setX(f, p.x + (leftSide ? -1 : 1));
  setY(f, p.y);
  p.type &= 0x3f;
  f.xspeed = 0;
  f.yspeedFix = 0;
  f.hasSupport = true;
  f.frame = 0;
  f.headsLeft = leftSide;
  f.isCycling = false;
  f.weaponState = 0;
  m.ai.makeDecision(m, f);
}

/** G_MoveCyclist: one tick of cycle control for command `cmd` (bits: 2 up, 4 left, 0x20 right, 0x40 down, 0x100 fire). */
export function moveCyclist(m: Match, f: Fighter, cmdIn: number): void {
  const c = m.cycle!;
  let n = cmdIn;
  if (f.hp <= 0) {
    n = 64;
    if (--f.busyIndex === 0) {
      respawnFighter(m, f);
      return;
    }
    emitFx(m, (m.tick & 1) === 0 ? 'smokeLong' : 'explosion', f.x + m.rng.range(-16, 16), f.y - m.rng.range(0, 32));
  }
  f.yspeedFix = (n & 2) !== 0
    ? Math.max(f.yspeedFix - 256, -1280)
    : (n & 0x40) !== 0
      ? Math.min(f.yspeedFix + 256, 1280)
      : f.yspeedFix < 0 ? Math.min(f.yspeedFix + 128, 0) : Math.max(f.yspeedFix - 128, 0);
  if ((n & CMD_LEFT) !== 0) {
    f.xspeed = Math.max(f.xspeed - 256, -1792);
    f.headsLeft = true;
  } else if ((n & CMD_RIGHT) !== 0) {
    f.xspeed = Math.min(f.xspeed + 256, 1792);
    f.headsLeft = false;
  } else {
    f.xspeed = f.xspeed < 0 ? Math.min(f.xspeed + 128, 0) : Math.max(f.xspeed - 128, 0);
  }
  const dx = f.xspeed >> 8;
  let ny = f.y + (f.yspeedFix >> 8);
  if (ny < c.y1) {
    ny = c.y1;
    f.yspeedFix = 0;
  } else if (ny > c.y2) {
    ny = c.y2;
    f.yspeedFix = 0;
  }
  let nx = f.x + dx;
  const nodes = m.map.nodes;
  if (nx < c.x1) {
    nx = c.x1;
    f.xspeed = 0;
    if ((n & CMD_LEFT) !== 0) {
      for (let i = 0; i < c.dockNodes.length; i++) {
        const node = nodes[c.dockNodes[i]!]!;
        if (node.x >= c.x1 || Math.abs(f.y - node.y) >= 16) continue;
        getFromCycle(m, f, c.dockPobjs[i]!, c.dockNodes[i]!);
        return;
      }
    }
  } else if (nx > c.x2) {
    nx = c.x2;
    f.xspeed = 0;
    if ((n & CMD_RIGHT) !== 0) {
      for (let i = 0; i < c.dockNodes.length; i++) {
        const node = nodes[c.dockNodes[i]!]!;
        if (node.x <= c.x2 || Math.abs(f.y - node.y) >= 16) continue;
        getFromCycle(m, f, c.dockPobjs[i]!, c.dockNodes[i]!);
        return;
      }
    }
  }
  setY(f, ny);
  setX(f, nx);
  if (f.weaponState > 0) {
    f.weaponState--;
  } else if ((n & CMD_FIRE) !== 0) {
    emitSound(m, 'laser', f.x, f.y);
    const y = f.y - 7;
    const x1 = f.headsLeft ? f.x - 24 : f.x + 24;
    let x2 = f.headsLeft ? shootXLeft(m, x1, y, 96) : shootXRight(m, x1, y, 96);
    const t = pickTarget(m, f, x1, x2, y);
    if (t) {
      x2 = t.x;
      applyDamage(m, f.side, t, m.rng.range(20, 40), false, true, f);
      if (m.opts.violence) emitFx(m, `blood${m.rng.int(3)}`, x2, y);
    }
    m.rays.push({ x1, x2, y, tick: m.tick, bright: 0xffff66, dim: 0xdddd00 });
    f.weaponState = 10;
  }
  syncPoWindow(m, f);
}
