import { afterEach, describe, expect, it } from 'vitest';
import { teamFragItems, teamFragLine } from '../../src/game/stats';
import { setLang } from '../../src/i18n';
import { createMatch } from '../../src/engine/match';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

afterEach(() => setLang('en'));
const ctf = () => createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS);

describe('team frag text', () => {
  it('lists the player first, then the ally; enemies are not included', () => {
    const m = ctf();
    m.fighters[0]!.frags = 3;
    m.fighters[1]!.frags = 1;
    m.fighters[2]!.frags = 9;
    expect(teamFragItems(m, 0)).toEqual([{ label: 'You', frags: 3 }, { label: 'Ally', frags: 1 }]);
    expect(teamFragLine(m)).toBe('Frags: You 3  ·  Ally 1');
  });

  it('is only the player in a solo CTF match and empty in Deathmatch', () => {
    const solo = createMatch({ ...CTF_OPTS, team: false }, REAL_MAPS[7]!, 1, REAL_ASSETS);
    solo.fighters[0]!.frags = 2;
    expect(teamFragLine(solo)).toBe('Frags: You 2');
    expect(teamFragLine(createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS))).toBe('');
  });

  it('shows negative frags (suicides, teammate kills) as they are', () => {
    const m = ctf();
    m.fighters[1]!.frags = -2;
    expect(teamFragLine(m)).toBe('Frags: You 0  ·  Ally -2');
  });

  it('is translated', () => {
    setLang('ru');
    const m = ctf();
    m.fighters[0]!.frags = 5;
    expect(teamFragLine(m)).toBe('Фраги: Вы 5  ·  Союзник 0');
  });
});
