import { describe, expect, it } from 'vitest';
import { createMatch, matchResult, snapshot, step } from '../../src/engine/match';
import { scanPickups } from '../../src/engine/items';
import { applyDamage } from '../../src/engine/lifecycle';
import { createRng } from '../../src/engine/rng';
import { NO_INPUT, type InputState, type Match } from '../../src/engine/types';
import { place, syncWindow } from './helpers';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from './real';

const dm = (seed = 1) => createMatch(DM_OPTS, REAL_MAPS[0]!, seed, REAL_ASSETS);
const ctf = (seed = 1) => createMatch(CTF_OPTS, REAL_MAPS[7]!, seed, REAL_ASSETS);

describe('match setup', () => {
  it('DM: player plus N bots on distinct spawns with distinct colours', () => {
    const m = dm();
    expect(m.numFighters).toBe(4);
    const xs = new Set(m.fighters.map((f) => `${f.x},${f.y}`));
    expect(xs.size).toBe(4);
    expect(new Set(m.fighters.map((f) => f.color)).size).toBe(4);
    expect(m.fighters[0]!.color).toBe(0);
    for (const f of m.fighters) {
      expect(f.hp).toBe(100);
      expect(f.ammo[1]).toBe(25);
    }
  });

  it('CTF 2v2: fighters 0,1 share the player colour, 2,3 the enemy colour', () => {
    const m = ctf();
    expect(m.numFighters).toBe(4);
    expect(m.numSides).toBe(2);
    expect(m.fighters.map((f) => f.side)).toEqual([0, 0, 1, 1]);
    expect(m.fighters.map((f) => f.color)).toEqual([0, 0, 1, 1]);
    expect(m.sideColors.slice(0, 2)).toEqual([0, 1]);
  });
});

describe('match end', () => {
  it('DM ends when a side reaches the frag limit and that side wins', () => {
    const m = dm();
    m.score[2] = 4;
    expect(matchResult(m).over).toBe(false);
    m.score[2] = 5;
    expect(matchResult(m)).toEqual({ over: true, winner: 2 });
  });
  it('two sides reaching the limit together is a draw', () => {
    const m = dm();
    m.score[0] = 5;
    m.score[1] = 5;
    expect(matchResult(m)).toEqual({ over: true, winner: 'draw' });
  });
  it('a limit of 0 never ends the match', () => {
    const m = createMatch({ ...DM_OPTS, fragLimit: 0 }, REAL_MAPS[0]!, 1, REAL_ASSETS);
    m.score[0] = 99;
    expect(matchResult(m).over).toBe(false);
  });
});

describe('CTF rules', () => {
  const base = (m: Match, type: number) => m.pobjs.find((p) => p.type === type)!;
  const idx = (m: Match, type: number) => m.pobjs.findIndex((p) => p.type === type);

  function stand(m: Match, n: number, at: { x: number; y: number }): void {
    const f = m.fighters[n]!;
    place(f, at.x, at.y, true);
    syncWindow(m, f);
  }

  it('carrying the enemy flag to your own base scores one point and returns the flag', () => {
    const m = ctf();
    const red = base(m, 11);
    const blue = base(m, 10);
    stand(m, 0, red);
    scanPickups(m, m.fighters[0]!, 0);
    expect(m.fighters[0]!.isCarrying).toBe(true);
    expect(m.flagIsTaken[1]).toBe(true);
    stand(m, 0, blue);
    scanPickups(m, m.fighters[0]!, 0);
    expect(m.score[0]).toBe(1);
    expect(m.fighters[0]!.isCarrying).toBe(false);
    expect(m.pobjs.some((p) => p.type === 11)).toBe(true);
  });

  it('no point while your own flag is also captured', () => {
    const m = ctf();
    const red = base(m, 11);
    const blue = base(m, 10);
    stand(m, 0, red);
    scanPickups(m, m.fighters[0]!, 0); // blue player steals the red flag
    stand(m, 2, blue);
    scanPickups(m, m.fighters[2]!, 0); // red enemy steals the blue flag
    expect(idx(m, 20)).toBeGreaterThanOrEqual(0);
    const home = m.pobjs[idx(m, 20)]!;
    stand(m, 0, home);
    scanPickups(m, m.fighters[0]!, 0);
    expect(m.score[0]).toBe(0);
    expect(m.fighters[0]!.isCarrying).toBe(true);
  });

  it('a carrier who dies returns the flag to its base', () => {
    const m = ctf();
    stand(m, 0, base(m, 11));
    scanPickups(m, m.fighters[0]!, 0);
    applyDamage(m, 1, m.fighters[0]!, 500, false, false);
    expect(m.fighters[0]!.isCarrying).toBe(false);
    expect(m.flagIsTaken[1]).toBe(false);
    expect(m.pobjs.some((p) => p.type === 11)).toBe(true);
    expect(m.score[1]).toBe(0);
  });

  it('CTF scores are captures: kills do not count', () => {
    const m = ctf();
    applyDamage(m, 1, m.fighters[0]!, 500, false, false);
    expect(m.score.slice(0, 2)).toEqual([0, 0]);
  });
});

describe('determinism', () => {
  function scripted(m: Match, ticks: number): void {
    const r = createRng(1234);
    for (let t = 0; t < ticks; t++) {
      const inputs = new Map<number, InputState>();
      for (let n = 0; n < m.numFighters; n++) {
        inputs.set(n, {
          ...NO_INPUT, left: r.bits(3) === 0, right: r.bits(3) === 1, jump: r.bits(7) === 0, fire: r.bits(3) === 2,
          action: r.bits(15) === 0, weaponSelect: r.bits(31) === 0 ? 2 : -1,
        });
      }
      step(m, inputs);
    }
  }
  it('same seed + same inputs for 5000 ticks gives identical state', () => {
    const a = dm(42);
    const b = dm(42);
    scripted(a, 5000);
    scripted(b, 5000);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.tick).toBe(5000);
  });
  it('different seeds diverge', () => {
    const a = dm(1);
    const b = dm(2);
    scripted(a, 500);
    scripted(b, 500);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });
  it('fighters stay inside the map during a long scripted run', () => {
    const m = ctf(5);
    scripted(m, 3000);
    for (const f of m.fighters) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(m.mapWidth);
      expect(f.y).toBeLessThanOrEqual(m.mapHeight + 40);
    }
  });
});
