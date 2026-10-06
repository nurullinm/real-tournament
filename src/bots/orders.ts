import type { Match } from '../engine/types';
import { setCycleDestination } from './control';

/** 0 "Defend the base", 1 "Take their flag!", 2 "Freelance!" (strings 69-71 of real.str). */
export type AllyOrder = 0 | 1 | 2;

/** AI_CommandToBot: CTF only. */
function commandToBot(m: Match, n: number, order: number): void {
  if (m.gameMode === 0) return;
  const f = m.fighters[n]!;
  f.aiOrder = order;
  if (f.isCycling) setCycleDestination(m, f);
}

/** Player's order to the ally (fighter 1). Only possible in a 2v2 CTF match. */
export function setAllyOrder(m: Match, order: AllyOrder): void {
  if (m.gameMode === 1 && m.numFighters >= 4) commandToBot(m, 1, order);
}

/** AI_MakeStrategicalDecision: the enemy team's (fighters 2 and 3) plan, re-evaluated on flag events and periodically. */
export function makeStrategicalDecision(m: Match): void {
  if (m.gameMode !== 1 || m.numFighters < 4) return;
  if (m.flagIsTaken[0]) {
    const n = m.rng.bits(1);
    commandToBot(m, 2, n);
    commandToBot(m, 3, n);
  } else if (m.flagIsTaken[1]) {
    commandToBot(m, 2, 1);
    commandToBot(m, 3, 1);
  } else {
    commandToBot(m, 2, 0);
    commandToBot(m, 3, 0);
    const xs: number[] = [];
    const ids: number[] = [];
    for (let i = 0; i < m.numFighters; i++) {
      xs[i] = m.sideColors[0] === 0 ? -m.fighters[i]!.x : m.fighters[i]!.x;
      ids[i] = m.fighters[i]!.number;
    }
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 4; j++) {
        if (xs[i]! <= xs[j]!) continue;
        [xs[i], xs[j]] = [xs[j]!, xs[i]!];
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      }
    }
    let key = 0;
    for (let i = 0; i < 3; i++) if (ids[i]! >= 2) key += 1 << (i * 4);
    switch (key) {
      case 17:
        if (m.rng.bits(3) === 0) commandToBot(m, 2, 1);
        if (m.rng.bits(3) === 0) commandToBot(m, 3, 1);
        break;
      case 257:
      case 272:
        commandToBot(m, 2, 0);
        commandToBot(m, 3, 0);
        break;
      case 4097:
        commandToBot(m, ids[3]!, 1);
    }
  }
}
