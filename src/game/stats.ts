import type { Match } from '../engine/types';
import { t } from '../i18n';

/** Personal frags of everybody on the player's team, player first ("You 3", "Ally 1"). */
export function teamFragItems(m: Match, playerId: number): { label: string; frags: number }[] {
  const me = m.fighters[playerId]!;
  const mates = m.fighters.slice(0, m.numFighters).filter((f) => f !== me && f.side === me.side);
  return [{ label: t('hud.you'), frags: me.frags }, ...mates.map((f) => ({ label: t('hud.ally'), frags: f.frags }))];
}

/** "Frags: You 3 · Ally 1" for team (CTF) matches; empty in Deathmatch where the score already is the frag count. */
export function teamFragLine(m: Match, playerId = 0): string {
  if (m.gameMode !== 1) return '';
  const items = teamFragItems(m, playerId).map((i) => `${i.label} ${i.frags}`).join('  ·  ');
  return `${t('result.frags')}: ${items}`;
}

export interface ScoreRow { name: string; color: number; kills: number; deaths: number; you: boolean }

/** Mini scoreboard (Counter-Strike style): everybody with kills (frags) and deaths, best first. */
export function scoreboard(m: Match, localSlot = 0, names: string[] = []): ScoreRow[] {
  const rows: ScoreRow[] = [];
  let bot = 0;
  for (let i = 0; i < m.numFighters; i++) {
    const f = m.fighters[i]!;
    const online = names.length > 0;
    const name = i === localSlot ? (online ? names[i] ?? t('hud.you') : t('hud.you'))
      : f.human && names[i] ? names[i]!
      : m.gameMode === 1 ? (f.side === m.fighters[localSlot]!.side ? t('hud.ally') : t('hud.enemy'))
      : online || m.numFighters > 2 ? t('mp.bot', { n: ++bot }) : t('hud.enemy');
    rows.push({ name, color: f.color, kills: f.frags, deaths: f.deaths, you: i === localSlot });
  }
  return rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}
