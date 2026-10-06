import { setColor } from '../fighter';
import { respawnFighter, respawnFighterAt } from '../lifecycle';
import type { Match } from '../types';
import { genNonRepeating } from './deathmatch';

export function setupCtf(m: Match): void {
  const team = m.opts.team;
  m.numFighters = team ? 4 : 1;
  m.numSides = team ? 2 : 1;
  let color = m.opts.playerColor & 1;
  m.sideColors[0] = color;
  m.sideColors[1] = color ^ 1;
  for (let i = 0; i < m.numFighters; i++) {
    if (i === 2) color ^= 1;
    const f = m.fighters[i]!;
    setColor(f, color);
    f.flagBaseLeft = color === 0 ? 99 : 111;
    f.flagBaseRight = color === 0 ? 105 : 117;
    f.starts = color === 0 ? m.map.dmBlue : m.map.dmRed;
    f.side = i >> 1;
    // the player's ally (fighter 1) starts on "Freelance"; the enemy team is commanded by the strategist, defending first
    f.aiOrder = i === 1 || (i === 0 && !f.human) ? 2 : 0;
  }
  if (m.numFighters === 1) {
    respawnFighter(m, m.fighters[0]!);
  } else {
    const a = genNonRepeating(m, m.fighters[0]!.starts.length, 2, -1);
    respawnFighterAt(m, m.fighters[0]!, a[0]!);
    respawnFighterAt(m, m.fighters[1]!, a[1]!);
    const b = genNonRepeating(m, m.fighters[2]!.starts.length, 2, -1);
    respawnFighterAt(m, m.fighters[2]!, b[0]!);
    respawnFighterAt(m, m.fighters[3]!, b[1]!);
  }
  m.fragLimit = m.opts.fragLimit;
}
