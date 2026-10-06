import { PLAYER_XSPEED_ADJ_THRESHOLD_FIX, JUMP_IMPULSE_FIX } from './constants';
import { cycleFrame, setSpeed, setX, setY } from './fighter';
import { killFighterCommon, respawnFighter } from './lifecycle';
import type { Fighter, Match } from './types';
import { CMD_ACTION, CMD_FIRE, CMD_JUMP, CMD_LEFT, CMD_RIGHT } from './types';
import { cellAt } from './world';

export { CMD_ACTION, CMD_FIRE, CMD_JUMP, CMD_LEFT, CMD_RIGHT };

/** Returns true when the move bumped into a wall. Port of G_MoveFighterLeftRight. */
export function moveFighterLeftRight(m: Match, f: Fighter, dx: number, bumpFrame: number): boolean {
  setX(f, f.x + dx);
  const blocked = (cellAt(m, f.v - 1, f.u) & 2) !== 0;
  if (!blocked) return false;
  if (dx < 0) {
    setX(f, (f.x + 16) & ~0xf);
    f.xspeed = -1;
  } else {
    setX(f, (f.x - 16) | 0xf);
    f.xspeed = 1;
  }
  f.frame = bumpFrame;
  return true;
}

/** Port of G_MoveFighterUpDown. May kill and respawn a fighter that fell off the map. */
export function moveFighterUpDown(m: Match, f: Fighter, dy: number): void {
  setY(f, f.y + dy);
  if (dy < 0) {
    if ((cellAt(m, f.v - 1, f.u) & 2) !== 0) {
      setY(f, (f.y + 16) & ~0xf);
      f.yspeedFix = 0;
    }
    return;
  }
  if (f.y > m.mapHeight + 40) {
    killFighterCommon(m, f.side, f, f.hp > 0);
    respawnFighter(m, f);
    return;
  }
  if ((cellAt(m, f.v, f.u) & 2) !== 0) {
    setY(f, f.y & ~0xf);
    if (!f.human) m.ai.catchGround(m, f);
  }
}

/** Input mask applied before movement/fire (passengers and dying fighters have limited control). */
export function effectiveCmd(f: Fighter, cmd: number): number {
  let n = cmd;
  if (f.isPassenger) n &= CMD_FIRE;
  if (f.hp <= 0) n = 0;
  if (f.busyIndex > 0) n &= CMD_FIRE;
  return n;
}

/**
 * Movement phase of G_MoveFighter for the masked command `n`.
 * Returns true if the fighter walked this tick (needed for the ledge check).
 */
export function stepMovement(m: Match, f: Fighter, n: number): boolean {
  let walked = false;
  if (f.hasSupport && (n & CMD_JUMP) === 0) {
    if ((n & (CMD_LEFT | CMD_RIGHT)) !== 0) {
      const left = (n & CMD_LEFT) !== 0;
      f.xspeed = left ? -3 : 3;
      cycleFrame(f, 25, 36);
      f.headsLeft = left;
      const bumped = moveFighterLeftRight(m, f, f.xspeed, 25);
      if (bumped && !f.human) m.ai.findNearestNode(m, f);
      walked = true;
    } else {
      cycleFrame(f, 0, 24);
      f.xspeed = 0;
    }
    f.yspeedFix = 0;
    return walked;
  }
  f.liftcar = -1;
  if (f.hasSupport) {
    f.yspeedFix = 0;
    if ((n & CMD_JUMP) !== 0) {
      setSpeed(f, 3);
      f.yspeedFix = JUMP_IMPULSE_FIX;
      f.jumpThrust = true;
    }
  }
  if ((n & CMD_JUMP) === 0) f.jumpThrust = false;
  if ((n & CMD_LEFT) !== 0) f.headsLeft = true;
  if ((n & CMD_RIGHT) !== 0) f.headsLeft = false;
  f.yspeedFix += !f.jumpThrust && f.yspeedFix < 0 ? 768 : 256;
  let dy = f.yspeedFix >> 8;
  let dx = f.xspeed;
  if (dy < -10) dy = -10;
  if (dy > 10) {
    dy = 10;
    if (f.yspeedFix > PLAYER_XSPEED_ADJ_THRESHOLD_FIX) dx = Math.trunc((f.xspeed * PLAYER_XSPEED_ADJ_THRESHOLD_FIX) / f.yspeedFix);
  }
  moveFighterUpDown(m, f, dy);
  moveFighterLeftRight(m, f, dx, 27);
  f.frame = 27;
  return false;
}

/** Death-animation playback (busy sequence); respawns at the end if standing. */
export function stepBusy(m: Match, f: Fighter): void {
  if (f.busyIndex <= 0) return;
  f.frame = f.busySequence![--f.busyIndex]!;
  if (f.hp <= 0 && f.busyIndex === 0) {
    if (f.hasSupport) respawnFighter(m, f);
    else f.busyIndex = 1;
  }
}

/** hasSupport update at the end of the physics step; a walker stepping off a ledge keeps drifting at speed 1. */
export function updateSupport(m: Match, f: Fighter, walked: boolean): void {
  f.hasSupport = f.isPassenger || ((f.y & 0xf) === 0 && (cellAt(m, f.v, f.u) & 1) !== 0);
  if (!f.hasSupport && walked) setSpeed(f, 1);
}

/** Physics-only step used by tests and by moveFighter: mask, movement, death animation, support. */
export function stepFighterPhysics(m: Match, f: Fighter, cmd: number): number {
  const n = effectiveCmd(f, cmd);
  const walked = stepMovement(m, f, n);
  stepBusy(m, f);
  updateSupport(m, f, walked);
  return n;
}
