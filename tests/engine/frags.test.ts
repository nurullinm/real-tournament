import { describe, expect, it } from 'vitest';
import { advanceWeapon, startFire, stepProjectiles } from '../../src/engine/combat';
import { applyDamage } from '../../src/engine/lifecycle';
import { createMatch } from '../../src/engine/match';
import { CMD_FIRE, type Match } from '../../src/engine/types';
import { stepTram } from '../../src/engine/vehicles';
import { duel, place, roomMatch, roomMatchWith } from './helpers';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from './real';

/** 2v2 in the test room: fighters 0,1 on side 0 and 2,3 on side 1, spread along the floor. */
function team(): Match {
  const m = roomMatch();
  m.gameMode = 1;
  m.numFighters = 4;
  m.numSides = 2;
  m.fighters.forEach((f, i) => { f.side = i >> 1; f.color = i >> 1; place(f, 60 + i * 50, 160, true); });
  return m;
}
const kill = (m: Match, killer: number, victim: number) => applyDamage(m, m.fighters[killer]!.side, m.fighters[victim]!, 999, false, false, m.fighters[killer]!);

describe('personal frags', () => {
  it('start at zero in a new match', () => {
    for (const m of [createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS), createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS)]) {
      expect(m.fighters.map((f) => f.frags)).toEqual([0, 0, 0, 0]);
    }
  });

  it('a kill credits only the fighter who made it, also in a team match', () => {
    const m = team();
    kill(m, 1, 2); // the ally kills an enemy
    kill(m, 0, 3); // the player kills the other enemy
    kill(m, 0, 2);
    expect(m.fighters.map((f) => f.frags)).toEqual([2, 1, 0, 0]);
  });

  it('CTF captures stay the team score; kills do not change it', () => {
    const m = team();
    kill(m, 0, 2);
    expect(m.score.slice(0, 2)).toEqual([0, 0]);
    expect(m.fighters[0]!.frags).toBe(1);
  });

  it('Deathmatch keeps its side score and also counts personal frags', () => {
    const m = roomMatch();
    duel(m, 3);
    kill(m, 0, 1);
    expect(m.score[0]).toBe(1);
    expect(m.fighters[0]!.frags).toBe(1);
  });

  it('a suicide (or a fall with no killer) costs a frag, a teammate kill costs a frag', () => {
    const m = team();
    applyDamage(m, 0, m.fighters[0]!, 999, false, false, null);
    expect(m.fighters[0]!.frags).toBe(-1);
    kill(m, 2, 2);
    expect(m.fighters[2]!.frags).toBe(-1);
    kill(m, 1, 0); // the ally kills the player
    expect(m.fighters[1]!.frags).toBe(-1);
    expect(m.fighters[0]!.frags).toBe(-1);
  });

  it('a laser shot credits the shooter', () => {
    const m = team();
    const a = m.fighters[1]!;
    place(a, 100, 160, true);
    place(m.fighters[2]!, 110, 160, true);
    m.fighters[2]!.hp = 5;
    a.currentWeapon = 1;
    a.ammo[1] = 10;
    a.headsLeft = false;
    startFire(m, a, CMD_FIRE);
    for (let i = 0; i < 6; i++) advanceWeapon(m, a);
    expect(m.fighters[2]!.hp).toBeLessThanOrEqual(0);
    expect(a.frags).toBe(1);
    expect(m.fighters[0]!.frags).toBe(0);
  });

  it('a rocket credits the fighter who fired it, not just his side', () => {
    const m = team();
    place(m.fighters[0]!, 20, 160, true);
    place(m.fighters[1]!, 30, 160, true);
    place(m.fighters[2]!, 110, 160, true);
    m.fighters[2]!.hp = 10;
    m.projectiles.push({ type: 56, x: 100, y: 150, v: 5, owner: 0, ownerNumber: 1, selfLiq: 90 });
    stepProjectiles(m);
    expect(m.fighters[2]!.hp).toBeLessThanOrEqual(0);
    expect(m.fighters[1]!.frags).toBe(1);
    expect(m.fighters[0]!.frags).toBe(0);
  });

  it('being crushed by the tram counts as a suicide', () => {
    const m = roomMatchWith({ tram: { x1: 100, x2: 160, y: 160 } });
    duel(m, 2);
    m.tram.x = 100;
    m.tram.speed = 1;
    place(m.fighters[1]!, 170, 160, true);
    for (let i = 0; i < 120 && m.tram.state !== 3; i++) { m.tick++; stepTram(m); }
    expect(m.fighters[1]!.hp).toBeLessThanOrEqual(0);
    expect(m.fighters[1]!.frags).toBe(-1);
  });
});
