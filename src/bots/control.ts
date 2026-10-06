import { COLOR_BLUE } from '../engine/constants';
import { canShoot } from '../engine/fighter';
import { BRAKE_DISTANCE, CMD_FIRE } from '../engine/types';
import type { Fighter, Match } from '../engine/types';
import { canHit, cellAt, findNearestNode, makeDecision, node } from './nav';

const TRAM_DANGER = 39;

/** AI_ControlFighter: the command bits a bot presses this tick (2 jump, 4 left, 0x20 right, 0x40 action, 0x100 fire). */
export function controlFighter(m: Match, f: Fighter): number {
  if (f.hp < 0 || f.busyIndex > 0) return 0;
  const plusV = f.hasSupport ? -2 : -1;
  let cmd = 0;
  let target: Fighter | null = null;
  if (f.hasSupport && !f.isPassenger && (m.tick & 7) === 0 && f.y !== node(m, f.aiNodeAhead).y && f.y !== node(m, f.aiNodeBehind).y) {
    findNearestNode(m, f);
  }
  if (m.rng.bits(7) === 0) f.aiIgnoreChasers = !f.aiIgnoreChasers;
  if (f.isCarrying) {
    if (m.numFighters === 4 && canHit(m, f, m.fighters[f.number ^ 1]!, plusV)) f.aiIgnoreChasers = true;
    else if (m.rng.bits(7) === 0) f.aiIgnoreChasers = !f.aiIgnoreChasers;
  } else {
    f.aiIgnoreChasers = false;
  }
  if (!f.aiIgnoreChasers) {
    for (let i = 0; i < m.numFighters; i++) {
      const t = m.fighters[i]!;
      if (t.hp < 0 || t.side === f.side || !canHit(m, f, t, plusV)) continue;
      target = t;
      if (f.weaponState !== 0) break;
      f.headsLeft = t.x < f.x;
      if (m.rng.bits(255) >= m.aiReaction) break;
      cmd |= CMD_FIRE;
      break;
    }
  }
  if (m.rng.bits(255) < m.aiReaction) {
    f.pendingWeapon = target !== null && f.weaponState === 0
      ? Math.abs(target.x - f.x) < 15 ? 0 : (target.hp < 20 || canShoot(f, 2) ? 1 : 2)
      : canShoot(f, 2) ? 2 : 1;
  }
  if (f.isPassenger) return cmd;
  if (f.hasSupport) {
    f.aiJumpDestX = -1000;
    if (target) {
      let canJump = false;
      const c = cellAt(m, f.v, f.u);
      if (f.headsLeft) {
        if ((c & 4) !== 0) {
          canJump = true;
          if ((c & 0x10) !== 0) f.aiJumpDestX = f.x - 32;
        }
      } else if ((c & 8) !== 0) {
        canJump = true;
        if ((c & 0x20) !== 0) f.aiJumpDestX = f.x + 32;
      }
      if (canJump && m.rng.bits(1023) < m.aiJumpiness) {
        cmd |= 2;
        if (f.aiJumpDestX < 0 && f.currentWeapon === 0) f.aiJumpDestX = target.x;
      }
      if (f.isCarrying) cmd |= 0x40;
    } else {
      cmd |= navigate(m, f);
    }
  } else if (Math.abs(f.x - f.aiJumpDestX) > 21) {
    cmd |= 2;
  }
  return cmd;
}

/** Route following when nothing is in sight. */
function navigate(m: Match, f: Fighter): number {
  let cmd = 0;
  const behind = f.aiNodeBehind;
  const ahead = f.aiNodeAhead;
  const bn = node(m, behind);
  const an = node(m, ahead);
  const sx = an.x;
  const bx = bn.x;
  const t = m.tram;
  const dangerX1 = t.x1 - TRAM_DANGER;
  const safeX1 = dangerX1 - 3;
  const dangerX2 = t.x2 + TRAM_DANGER;
  const safeX2 = dangerX2 + 3;
  if (bn.top !== ahead) {
    if (bn.right === ahead) {
      if (f.x > sx - 7 && f.y === an.y) {
        makeDecision(m, f);
        if (node(m, f.aiNodeBehind).type === 6 && node(m, f.aiNodeAhead).type === 5) cmd |= 2;
      }
      if (an.type === 9 && t.x > t.x1 && f.x < t.x1) {
        if (f.x < safeX1) cmd |= 0x20;
        else if (f.x >= dangerX1) cmd |= 4;
      } else {
        cmd |= 0x20;
      }
    } else {
      if (f.x < sx + 7 && f.y === an.y) {
        makeDecision(m, f);
        if (node(m, f.aiNodeBehind).type === 5 && node(m, f.aiNodeAhead).type === 6) cmd |= 2;
      }
      if (an.type === 9 && t.x < t.x2 && f.x > t.x2) {
        if (f.x <= dangerX2) cmd |= 0x20;
        else if (f.x > safeX2) cmd |= 4;
      } else {
        cmd |= 4;
      }
    }
    return cmd;
  }
  switch (bn.type) {
    case 9:
      makeDecision(m, f);
      break;
    case 4:
    case 10: {
      const d = f.x - bx;
      if (Math.abs(d) < 7) cmd |= 0x40;
      else if (d < 0) cmd |= 0x60;
      else cmd |= 0x44;
      break;
    }
    case 1:
      if (f.x < sx + 7) {
        cmd |= 0x20;
        break;
      }
      if (f.x <= bx + 3) cmd |= 2;
      cmd |= 4;
      break;
    case 2:
      if (f.x > sx - 7) {
        cmd |= 4;
        break;
      }
      if (f.x >= bx - 3) cmd |= 2;
      cmd |= 0x20;
      break;
    case 5:
      cmd |= 4;
      break;
    case 6:
      cmd |= 0x20;
  }
  return cmd;
}

/** AI_SetCycleDestNode: target a dock on the side of the given colour (blue = left). */
function setCycleDestNode(m: Match, f: Fighter, color: number): void {
  const list = m.cycle ? (color === COLOR_BLUE ? m.cycle.leftNodes : m.cycle.rightNodes) : [];
  if (list.length > 0) f.aiNodeAhead = list[m.rng.int(list.length)]!;
}

/** AI_SetCycleDestination */
export function setCycleDestination(m: Match, f: Fighter): void {
  const c = m.cycle;
  if (f.human || !c) return;
  if (f.isCarrying) {
    setCycleDestNode(m, f, f.color);
  } else if (f.aiOrder === 1) {
    setCycleDestNode(m, f, f.color ^ 1);
  } else if (f.aiOrder === 0) {
    setCycleDestNode(m, f, f.color);
  }
  if (f.aiNodeAhead >= 0) {
    const nd = node(m, f.aiNodeAhead);
    f.aiCycleDestX = nd.x;
    f.aiCycleDestY = nd.y;
    return;
  }
  f.aiCycleDestX = m.rng.range(c.x1 + 16, c.x2 - 16);
  f.aiCycleDestY = m.rng.range(c.y1, c.y2);
  if (m.rng.bits(15) === 0) f.aiNodeAhead = c.dockNodes[m.rng.int(c.dockNodes.length)]!;
}

const brake = (speed: number): number => BRAKE_DISTANCE[Math.max(0, Math.min(15, speed))]!;

/** AI_ControlCyclist */
export function controlCyclist(m: Match, f: Fighter): number {
  const c = m.cycle;
  if (!c) return 0;
  const cx1 = c.x1 + 16;
  const cx2 = c.x2 - 16;
  let cmd = 0;
  if (Math.abs(f.x - f.aiCycleDestX) < 8 && Math.abs(f.y - f.aiCycleDestY) < 8) setCycleDestination(m, f);
  let engaged = false;
  const gunY = f.y - 7;
  const row = gunY >> 4;
  if (f.x > cx1 && f.x < cx2 && m.rng.int(255) < m.aiReaction) {
    for (let i = 0; i < m.numFighters; i++) {
      const t = m.fighters[i]!;
      if (t.side === f.side) continue;
      const dy = t.y - gunY;
      const dx = t.x - f.x;
      const adx = Math.abs(dx);
      const blocked = !t.isCycling && (dx < 0 ? (m.reachLeft[row]?.[f.u] ?? 0) > t.u : (m.reachRight[row]?.[f.u] ?? 0) < t.u);
      if (dy <= 0 || dy >= 32 || adx >= 96 || adx <= 24 || blocked) continue;
      engaged = true;
      if (dx < 0 && !t.headsLeft) cmd |= 4;
      else if (dx > 0 && t.headsLeft) cmd |= 0x20;
      cmd |= CMD_FIRE;
      break;
    }
  }
  if (!engaged && (m.tick & 7) === 0) {
    for (let i = 0; i < m.numFighters; i++) {
      const t = m.fighters[i]!;
      if (t.side === f.side || Math.abs(f.x - t.x) >= 96 || Math.abs(f.y - t.y) >= 112) continue;
      f.aiCycleDestX = m.rng.range(Math.max(t.x - 88, cx1), Math.min(t.x + 88, cx2));
      f.aiCycleDestY = t.y + m.rng.range(-16, 16);
    }
  }
  if ((cmd & 0x24) === 0) {
    const dx = f.aiCycleDestX - f.x;
    if (dx > 4) cmd |= f.xspeed < 0 || dx > brake(f.xspeed >> 8) ? 0x20 : 4;
    else if (dx < -4) cmd |= f.xspeed > 0 || -dx > brake(-f.xspeed >> 8) ? 4 : 0x20;
  }
  const dy = f.aiCycleDestY - f.y;
  if (dy > 4) cmd |= f.yspeedFix < 0 || dy > brake(f.yspeedFix >> 8) ? 0x40 : 2;
  else if (dy < -4) cmd |= f.yspeedFix > 0 || dy > brake(-f.yspeedFix >> 8) ? 0x40 : 2;
  return cmd;
}
