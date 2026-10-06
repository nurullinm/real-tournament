import { COLOR_BLUE } from '../engine/constants';
import type { AiNode } from '../assets/types';
import type { Fighter, Match } from '../engine/types';
import { cellAt } from '../engine/world';

export const node = (m: Match, i: number): AiNode => m.map.nodes[i]!;

/** AI_RoamAimlessly: wander to a random neighbouring node, never straight back. */
export function roamAimlessly(m: Match, f: Fighter): void {
  const opts: number[] = [];
  const ahead = f.aiNodeAhead;
  const an = node(m, ahead);
  const behind = f.aiNodeBehind;
  const bn = node(m, behind);
  if (an.left !== behind && an.left >= 0) opts.push(an.left);
  if (an.right !== behind && an.right >= 0) opts.push(an.right);
  if (an.top !== behind && an.top !== bn.top && an.top >= 0) opts.push(an.top);
  if (opts.length === 0) opts.push(behind);
  f.aiNodeBehind = ahead;
  f.aiNodeAhead = opts[m.rng.int(opts.length)]!;
}

/** AI_KeepBase: wander but only through nodes flagged as belonging to the fighter's colour. */
export function keepBase(m: Match, f: Fighter): void {
  const opts: number[] = [];
  const ahead = f.aiNodeAhead;
  const an = node(m, ahead);
  const behind = f.aiNodeBehind;
  const bn = node(m, behind);
  const mine = f.aiColorFlag;
  const ok = (n: number): boolean => n >= 0 && (node(m, n).flags & mine) !== 0;
  if (an.left !== behind && ok(an.left)) opts.push(an.left);
  if (an.right !== behind && ok(an.right)) opts.push(an.right);
  if (an.top !== behind && an.top !== bn.top && ok(an.top)) opts.push(an.top);
  if (opts.length === 0) opts.push(behind);
  f.aiNodeBehind = ahead;
  f.aiNodeAhead = opts[m.rng.int(opts.length)]!;
}

/** AI_MoveToFlag: follow the per-colour direction bits stored in node flags towards the flag of `color`. */
export function moveToFlag(m: Match, f: Fighter, color: number): void {
  const opts: number[] = [];
  const ahead = f.aiNodeAhead;
  const an = node(m, ahead);
  const bits = an.flags >> color;
  const behind = f.aiNodeBehind;
  const bn = node(m, behind);
  if (an.left !== behind && (bits & 4) !== 0) opts.push(an.left);
  if (an.right !== behind && (bits & 0x10) !== 0) opts.push(an.right);
  if (an.top !== behind && an.top !== bn.top && (bits & 0x40) !== 0) opts.push(an.top);
  if (opts.length === 0) {
    roamAimlessly(m, f);
    return;
  }
  f.aiNodeBehind = ahead;
  f.aiNodeAhead = opts[m.rng.int(opts.length)]!;
}

/** AI_MakeDecision: pick the next node according to carrying state and order. */
export function makeDecision(m: Match, f: Fighter): void {
  if (f.human) return;
  const mineFlagged = (node(m, f.aiNodeAhead).flags & f.aiColorFlag) !== 0;
  if (f.isCarrying) {
    if (m.flagIsTaken[f.side] && mineFlagged) keepBase(m, f);
    else moveToFlag(m, f, f.color);
    return;
  }
  switch (f.aiOrder) {
    case 2:
      roamAimlessly(m, f);
      break;
    case 1:
      moveToFlag(m, f, f.color ^ 1);
      break;
    case 0:
      if (mineFlagged) keepBase(m, f);
      else moveToFlag(m, f, f.color);
  }
}

/** AI_FindNearestNode: re-anchor on the closest node on the fighter's own floor (same y). */
export function findNearestNode(m: Match, f: Fighter): void {
  let best = -1;
  let bestDist = 999999;
  const nodes = m.map.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const dy = nodes[i]!.y - f.y;
    if (dy > 0) break;
    if (dy < 0) continue;
    const d = Math.abs(nodes[i]!.x - f.x);
    if (d >= bestDist) continue;
    best = i;
    bestDist = d;
  }
  if (best >= 0) {
    f.aiNodeBehind = f.aiNodeAhead = best;
    makeDecision(m, f);
  }
}

/** AI_CatchGround: after landing, resync the route if the fighter is no longer on a known floor. */
export function catchGround(m: Match, f: Fighter): void {
  if (f.y === node(m, f.aiNodeBehind).y) return;
  if (f.y === node(m, f.aiNodeAhead).y) {
    makeDecision(m, f);
    return;
  }
  findNearestNode(m, f);
}

/** AI_FighterShootsFighter: can `a` hit `b` from here (vertical window, range 96, no wall between)? */
export function canHit(m: Match, a: Fighter, b: Fighter, plusV: number): boolean {
  let lo = -1;
  let hi = 0;
  const dyv = a.yspeedFix - b.yspeedFix;
  if (dyv > 256 && !b.hasSupport) hi = 1;
  else if (dyv < -256) lo = -2;
  const dv = b.v - a.v;
  if (dv < lo || dv > hi) return false;
  if (Math.abs(a.x - b.x) > 96) return false;
  const row = a.v + plusV;
  if (a.x < b.x) return b.u <= (m.reachRight[row]?.[a.u] ?? 0);
  return (m.reachLeft[row]?.[a.u] ?? 0) <= b.u;
}

export { COLOR_BLUE, cellAt };
