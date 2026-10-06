import { describe, expect, it } from 'vitest';
import { botHooks } from '../../src/bots';
import { createMatch, snapshot, step } from '../../src/engine/match';
import type { MatchOptions } from '../../src/engine/types';
import { Lockstep } from '../../src/net/lockstep';
import { assignFighters, cleanName, clampConfig, normalizeCode, randomCode, CODE_ALPHABET, type WireInput } from '../../src/net/protocol';
import { REAL_ASSETS, REAL_MAPS } from '../engine/real';

const OPTS: MatchOptions = { mapId: 3, mode: 'dm', skill: 2, bots: 3, fragLimit: 0, noMedikits: false, violence: true, team: false, playerColor: 0, humans: 2 };
const idle: WireInput = { c: 0, ws: -1, wd: 0 };

/** pseudo-random but fixed "player" input stream for two humans */
function inputAt(n: number): WireInput[] {
  const pick = (k: number): WireInput => ({ c: ((n * 7 + k * 13) >> 3) & 0x1ff & (k ? 0x126 : 0x166), ws: n % 40 === k ? ((n + k) % 3) as 0 | 1 | 2 : -1, wd: 0 });
  return [pick(0), pick(1)];
}

function play(ticks: number, dropAt = -1): ReturnType<typeof snapshot> {
  const m = createMatch(OPTS, REAL_MAPS[3]!, 12345, REAL_ASSETS, botHooks);
  const ls = new Lockstep([0, 1]);
  for (let n = 1; n <= ticks; n++) {
    ls.push(n, inputAt(n), n === dropAt ? [1] : []);
    const t = ls.pull()!;
    for (const s of t.dropped) { const f = m.fighters[s]!; f.human = false; m.ai.findNearestNode(m, f); }
    step(m, t.inputs);
  }
  return snapshot(m);
}

describe('lockstep determinism', () => {
  it('two clients fed the same server ticks end in identical states', () => {
    expect(play(400)).toEqual(play(400));
  });

  it('a human dropping out mid-match hands the fighter to the AI identically everywhere', () => {
    const a = play(300, 120);
    expect(a).toEqual(play(300, 120));
    expect(a).not.toEqual(play(300));
  });

  it('the human flag decides who is bot-driven', () => {
    const m = createMatch(OPTS, REAL_MAPS[3]!, 1, REAL_ASSETS, botHooks);
    expect(m.fighters.map((f) => f.human)).toEqual([true, true, false, false]);
    expect(m.numFighters).toBe(4);
  });
});

describe('Lockstep queue', () => {
  it('only releases ticks in order and waits when the next one has not arrived', () => {
    const ls = new Lockstep([0, 1]);
    expect(ls.pull()).toBeNull();
    ls.push(2, [idle, idle]); // gap: ignored
    expect(ls.backlog).toBe(0);
    ls.push(1, [idle, idle]);
    ls.push(1, [idle, idle]); // duplicate
    ls.push(2, [idle, idle]);
    expect(ls.backlog).toBe(2);
    expect(ls.pull()!.n).toBe(1);
    expect(ls.pull()!.n).toBe(2);
    expect(ls.pull()).toBeNull();
  });

  it('turns wire input into engine input and strips dropped players', () => {
    const ls = new Lockstep([0, 1]);
    ls.push(1, [{ c: 0x20 | 0x100, ws: 2, wd: 0 }, idle], []);
    const t = ls.pull()!;
    expect(t.inputs.get(0)).toMatchObject({ right: true, fire: true, weaponSelect: 2 });
    ls.push(2, [idle, idle], [0]);
    const t2 = ls.pull()!;
    expect(t2.inputs.has(0)).toBe(false);
    expect(t2.inputs.has(1)).toBe(true);
    ls.push(3, [idle, idle]);
    expect(ls.pull()!.inputs.has(0)).toBe(false); // stays a bot
  });
});

describe('protocol helpers', () => {
  it('cleans nicknames', () => {
    expect(cleanName('  Bob <b>\n the   great  ')).toBe('Bob b the great');
    expect(cleanName('', 'Fallback')).toBe('Fallback');
    expect(cleanName(42)).toBe('Player');
    expect(cleanName('x'.repeat(40)).length).toBe(16);
  });

  it('clamps room config from untrusted input', () => {
    const c = clampConfig({ mapId: 99, bots: 9, fragLimit: -5, skill: 9 as never }, 3);
    expect(c).toMatchObject({ mapId: 6, bots: 1, fragLimit: 0, skill: 4 });
    expect(clampConfig({ bots: 99 }, 1).bots).toBe(3);
    expect(clampConfig({ bots: 0 }, 1).bots).toBe(1); // a lone human needs an opponent
    expect(clampConfig({ bots: 0 }, 2).bots).toBe(0); // two humans can play alone
    expect(clampConfig(undefined, 1).mapId).toBe(0);
  });

  it('room codes use the unambiguous alphabet and normalise typed input', () => {
    const code = randomCode();
    expect(code).toHaveLength(5);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(normalizeCode(' ab-c1d2e9 ')).toBe('ABC1D');
  });
});

describe('online capture the flag', () => {
  it('puts blue players on fighters 0-1 and red players on 2-3, whatever the join order', () => {
    expect(assignFighters('ctf', [{ team: 1 }, { team: 0 }, { team: 1 }, { team: 0 }])).toEqual([2, 0, 3, 1]);
    expect(assignFighters('ctf', [{ team: 0 }])).toEqual([0]);
    expect(assignFighters('dm', [{ team: 1 }, { team: 1 }, { team: 0 }])).toEqual([0, 1, 2]);
  });

  it('rejects a team with three players', () => {
    expect(assignFighters('ctf', [{ team: 0 }, { team: 0 }, { team: 0 }])).toBeNull();
  });

  it('CTF rooms are always 2v2 with bots filling empty places, and use CTF limits', () => {
    const c = clampConfig({ mode: 'ctf', mapId: 99, fragLimit: 99, bots: 0 }, 2);
    expect(c).toMatchObject({ mode: 'ctf', mapId: 4, fragLimit: 9, bots: 2 });
    expect(clampConfig({ mode: 'ctf' }, 1).bots).toBe(3);
    expect(clampConfig({ mode: 'dm', mapId: 99 }, 1).mapId).toBe(6);
  });

  it('two humans on opposite teams stay in sync, bots drive the other fighters', () => {
    const opts: MatchOptions = { mapId: 8, mode: 'ctf', skill: 2, bots: 0, fragLimit: 3, noMedikits: false, violence: true, team: true, playerColor: 0, humanSlots: [0, 2] };
    const run = (): ReturnType<typeof snapshot> => {
      const m = createMatch(opts, REAL_MAPS[8]!, 777, REAL_ASSETS, botHooks);
      expect(m.fighters.map((f) => f.human)).toEqual([true, false, true, false]);
      expect(m.fighters.map((f) => f.skin)).toEqual([0, 0, 1, 1]);
      const ls = new Lockstep([0, 2]);
      for (let n = 1; n <= 300; n++) {
        const i: WireInput[] = [0, 1, 2, 3].map((slot) => (slot === 0 || slot === 2 ? inputAt(n)[slot === 0 ? 0 : 1]! : idle));
        ls.push(n, i);
        const t = ls.pull()!;
        expect([...t.inputs.keys()].sort()).toEqual([0, 2]); // only the humans carry input; bots run the AI
        step(m, t.inputs);
      }
      return snapshot(m);
    };
    expect(run()).toEqual(run());
  });
});
