import { COLOR_BLUE, SEQ_DIE, SEQ_DIE_HARD, SEQ_DIE_REALLY_HARD } from './constants';
import { setBusy, setHp, setX, setY } from './fighter';
import type { Fighter, Match } from './types';
import { adjustPoToTheLeft, findPoToTheLeft } from './world';

const sound = (m: Match, name: string, x: number, y: number): void => { m.events.push({ kind: 'sound', name, x, y }); };
const fx = (m: Match, seq: string, x: number, y: number): void => { m.events.push({ kind: 'fx', seq, x, y }); };
export { sound as emitSound, fx as emitFx };

/** G_TeleportFighter */
export function teleportFighter(m: Match, f: Fighter, x: number, y: number): void {
  setX(f, x);
  setY(f, y);
  f.frame = 0;
  f.hasSupport = true;
  f.liftcar = -1;
  f.headsLeft = m.rng.range(0, 1) === 0;
  f.leftPoM1 = findPoToTheLeft(m, x - 12);
  f.rightPo = findPoToTheLeft(m, x + 12);
  f.busyIndex = 0;
  f.busySequence = null;
  f.isCycling = false;
  f.isPassenger = false;
  fx(m, 'respawn', f.x, f.y);
  fx(m, 'respawn', f.x, f.y - 8);
  sound(m, 'respawn', f.x, f.y);
  fx(m, 'respawn', f.x, f.y - 16);
}

/** G_RespawnFighterAt: `idx` indexes the fighter's `starts` list (node indices). */
export function respawnFighterAt(m: Match, f: Fighter, idx: number): void {
  f.weaponPresent = [true, true, false];
  f.ammo[1] = 25;
  f.ammo[2] = 0;
  f.currentWeapon = 1;
  f.pendingWeapon = -1;
  f.weaponState = 0;
  setHp(f, 100);
  f.armor = 0;
  f.isCarrying = false;
  const node = f.starts[idx]!;
  f.aiNodeBehind = f.aiNodeAhead = node;
  m.ai.makeDecision(m, f);
  const nd = m.map.nodes[node]!;
  teleportFighter(m, f, nd.x, nd.y);
}

/** G_RespawnFighter */
export function respawnFighter(m: Match, f: Fighter): void {
  if (f.isPassenger) {
    if (f.liftcar >= 0) m.pobjs[f.liftcar]!.data2 = -1;
    if (m.tram.passenger === f.number) m.tram.passenger = -1;
  }
  let n = m.rng.int(f.starts.length);
  if (m.gameMode === 0 && n === m.lastDmStart) n = m.rng.int(f.starts.length);
  m.lastDmStart = n;
  respawnFighterAt(m, f, n);
}

/** G_KillFighterCommon: `side` is the credited side. */
export function killFighterCommon(m: Match, side: number, f: Fighter, countScore: boolean): void {
  if (m.gameMode === 0 && countScore) {
    if (f.side === side) m.score[side]!--;
    else m.score[side]!++;
    m.events.push({ kind: 'kill', killer: side, victim: f.side });
  }
  returnFlag(m, f, false);
  setHp(f, 0);
  f.weaponState = 0;
}

/**
 * G_HurtFighter. `gore` allows the violent death animations (gated by the Violence option),
 * `dieSound` plays the death sound.
 */
export function applyDamage(m: Match, side: number, victim: Fighter, amount: number, gore: boolean, dieSound: boolean): void {
  if (victim.armor > 0) {
    const q = amount >> 2;
    const absorbed = Math.min(m.rng.range(q, amount - q), victim.armor);
    victim.armor -= absorbed;
    setHp(victim, victim.hp - amount + absorbed);
  } else {
    setHp(victim, victim.hp - amount);
  }
  if (victim.hp > 0) return;
  if (dieSound) sound(m, 'die', victim.x, victim.y);
  killFighterCommon(m, side, victim, true);
  if (victim.isCycling) {
    victim.busyIndex = 15;
    return;
  }
  if (gore && m.opts.violence) {
    const r = m.rng.int(3);
    if (r !== 0) {
      setBusy(victim, r === 1 ? SEQ_DIE_HARD : SEQ_DIE_REALLY_HARD);
      return;
    }
  }
  setBusy(victim, SEQ_DIE);
}

/** G_TakeFlag: fighter `f` picks up the flag of colour `flagColor` at pobj `idx`. */
export function takeFlag(m: Match, f: Fighter, idx: number, flagColor: number): void {
  sound(m, 'alarm', f.x, f.y);
  m.pobjs[idx]!.type = flagColor === COLOR_BLUE ? 20 : 21;
  m.flagIsTaken[f.side ^ 1] = true;
  f.isCarrying = true;
  m.events.push({ kind: 'flagTaken', side: f.side });
  m.ai.makeStrategicalDecision(m);
}

/** G_ReturnFlag: flag goes home; with `scored` the carrier's side gets a point. */
export function returnFlag(m: Match, f: Fighter, scored: boolean): void {
  if (!f.isCarrying) return;
  f.isCarrying = false;
  const enemy = f.color ^ 1;
  const carriedType = enemy === COLOR_BLUE ? 20 : 21;
  const baseType = enemy === COLOR_BLUE ? 10 : 11;
  m.flagIsTaken[f.side ^ 1] = false;
  const p = m.pobjs.find((o) => o.type === carriedType);
  if (p) p.type = baseType;
  if (scored) {
    sound(m, 'capture', f.x, f.y);
    m.score[f.side]!++;
    m.events.push({ kind: 'capture', side: f.side });
  }
  m.ai.makeStrategicalDecision(m);
}

/** Keeps a fighter's pobj window pointers in sync after it moves (used by pickups). */
export function syncPoWindow(m: Match, f: Fighter): void {
  f.rightPo = adjustPoToTheLeft(m, f.rightPo, f.x + 12);
  f.leftPoM1 = adjustPoToTheLeft(m, f.leftPoM1, f.x - 12);
}
