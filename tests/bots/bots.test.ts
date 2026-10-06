import { describe, expect, it } from 'vitest';
import { botHooks, botInput, setAllyOrder } from '../../src/bots';
import { scanPickups } from '../../src/engine/items';
import { createMatch, step } from '../../src/engine/match';
import { NO_INPUT, type InputState, type Match } from '../../src/engine/types';
import { place, syncWindow } from '../engine/helpers';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

const idlePlayer = () => new Map<number, InputState>([[0, NO_INPUT]]);
const optsFor = (id: number, extra = {}) => ({ ...(id < 7 ? DM_OPTS : CTF_OPTS), mapId: id, ...extra });

describe('roaming', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i))('bots roam widely and never run out of bounds on map %i', (id) => {
    const m = createMatch(optsFor(id, { skill: 3 }), REAL_MAPS[id]!, 7, REAL_ASSETS, botHooks);
    const visited = new Set<number>();
    for (let t = 0; t < 3000; t++) {
      step(m, idlePlayer());
      for (let n = 1; n < m.numFighters; n++) {
        const f = m.fighters[n]!;
        visited.add(f.aiNodeAhead * 10 + n);
        expect(f.ammo[1]).toBeGreaterThanOrEqual(0);
        expect(f.ammo[2]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(visited.size).toBeGreaterThanOrEqual(30);
    for (const f of m.fighters) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(m.mapWidth);
    }
  });
});

describe('skill levels', () => {
  function kills(skill: 0 | 4, seed: number): number {
    const m = createMatch({ ...DM_OPTS, skill }, REAL_MAPS[0]!, seed, REAL_ASSETS, botHooks);
    let k = 0;
    for (let t = 0; t < 3000; t++) {
      step(m, new Map<number, InputState>([[0, botInput(m, m.fighters[0]!)]]));
      for (const e of m.events) if (e.kind === 'kill') k++;
    }
    return k;
  }
  it('very hard bots score more kills than very easy ones in at least 8 of 10 seeded matches', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) if (kills(4, seed) > kills(0, seed)) wins++;
    expect(wins).toBeGreaterThanOrEqual(8);
  });
});

describe('CTF behaviour', () => {
  function carrierRun(id: number, seed: number): Match {
    const m = createMatch(optsFor(id, { skill: 3 }), REAL_MAPS[id]!, seed, REAL_ASSETS, botHooks);
    m.numFighters = 2; // no enemies: pure navigation
    const red = m.pobjs.find((p) => p.type === 11)!;
    const bot = m.fighters[1]!;
    place(bot, red.x, red.y, true);
    syncWindow(m, bot);
    scanPickups(m, bot, 0);
    expect(bot.isCarrying).toBe(true);
    for (let t = 0; t < 1500 && m.score[0] === 0; t++) step(m, idlePlayer());
    return m;
  }
  it.each([7, 8, 9, 10, 11])('a bot carrying the flag finds its way home and scores on map %i', (id) => {
    for (const seed of [1, 2, 3]) expect(carrierRun(id, seed).score[0], `seed ${seed}`).toBe(1);
  });

  it('a defending ally stays on its own base nodes', () => {
    for (const seed of [1, 2, 3]) {
      const m = createMatch(CTF_OPTS, REAL_MAPS[7]!, seed, REAL_ASSETS, botHooks);
      const ally = m.fighters[1]!;
      setAllyOrder(m, 0); // defend the base (the default is freelance)
      let outside = 0;
      let total = 0;
      for (let t = 0; t < 2000; t++) {
        step(m, idlePlayer());
        if (ally.isCarrying || ally.hp <= 0) continue;
        total++;
        if ((m.map.nodes[ally.aiNodeAhead]!.flags & ally.aiColorFlag) === 0) outside++;
      }
      expect(outside / total).toBeLessThan(0.05);
    }
  });

  it('the player can send the ally on the attack', () => {
    const m = createMatch(CTF_OPTS, REAL_MAPS[7]!, 4, REAL_ASSETS, botHooks);
    expect(m.fighters[1]!.aiOrder).toBe(2); // freelance by default
    setAllyOrder(m, 1);
    expect(m.fighters[1]!.aiOrder).toBe(1);
  });

  it('allies cannot be ordered in Deathmatch', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 4, REAL_ASSETS, botHooks);
    setAllyOrder(m, 0);
    expect(m.fighters[1]!.aiOrder).toBe(2);
  });

  it('when the player team steals the flag the enemy team goes on the attack', () => {
    const m = createMatch(CTF_OPTS, REAL_MAPS[7]!, 4, REAL_ASSETS, botHooks);
    const red = m.pobjs.find((p) => p.type === 11)!;
    place(m.fighters[0]!, red.x, red.y, true);
    syncWindow(m, m.fighters[0]!);
    scanPickups(m, m.fighters[0]!, 0);
    expect(m.fighters[2]!.aiOrder).toBe(1);
    expect(m.fighters[3]!.aiOrder).toBe(1);
  });
});
