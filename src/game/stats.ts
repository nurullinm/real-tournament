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
