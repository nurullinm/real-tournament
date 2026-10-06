import { setColor } from '../fighter';
import { respawnFighterAt } from '../lifecycle';
import type { Match } from '../types';

/** U_GenNonRepeating: `count` distinct values from [0, n); `first` (>= 0) is forced into slot 0. */
export function genNonRepeating(m: Match, n: number, count: number, first: number): number[] {
  const out: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  let remaining = n;
  if (first >= 0) {
    out.push(first);
    used[first] = true;
    remaining--;
  }
  while (out.length < count) {
    let idx = 0;
    for (let i = m.rng.int(remaining); i >= 0; i--) {
      while (used[idx]) idx++;
      if (i > 0) idx++;
    }
    out.push(idx);
    used[idx] = true;
    remaining--;
  }
  return out;
}

/** Online: the humans keep the colours they picked, bots get whatever is left (deterministic, no RNG). */
function assignColors(humanColors: number[], n: number): number[] {
  const out = humanColors.slice(0, n);
  for (let c = 0; out.length < n && c < 4; c++) if (!out.includes(c)) out.push(c);
  return out;
}

export function setupDeathmatch(m: Match): void {
  const n = m.opts.bots + 1;
  m.numFighters = m.numSides = n;
  const starts = genNonRepeating(m, m.map.dmBlue.length, n, -1);
  const colors = m.opts.humanColors ? assignColors(m.opts.humanColors, n) : genNonRepeating(m, 4, n, m.opts.playerColor);
  for (let i = 0; i < n; i++) {
    const f = m.fighters[i]!;
    f.starts = m.map.dmBlue;
    setColor(f, colors[i]!);
    respawnFighterAt(m, f, starts[i]!);
    f.side = i;
    m.sideColors[i] = colors[i]!;
    f.aiOrder = 2;
  }
  m.fragLimit = m.opts.fragLimit;
}
