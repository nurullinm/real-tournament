import { describe, expect, it } from 'vitest';
import { botHooks } from '../../src/bots';
import { cloneMatch, COPIED_FIELDS, SHARED_FIELDS } from '../../src/engine/clone';
import { createMatch, step } from '../../src/engine/match';
import type { InputState, Match, MatchOptions } from '../../src/engine/types';
import { REAL_ASSETS, REAL_MAPS } from './real';

const OPTS: MatchOptions = { mapId: 3, mode: 'dm', skill: 3, bots: 3, fragLimit: 0, noMedikits: false, violence: true, team: false, playerColor: 0, humans: 2 };

const inputAt = (n: number, k: number): InputState => ({
  left: ((n >> 3) + k) % 5 === 0, right: ((n >> 2) + k) % 3 === 0, jump: (n + k * 7) % 11 === 0, fire: (n + k) % 4 === 0,
  action: (n + k * 3) % 13 === 0, weaponSelect: n % 37 === k ? ((n + k) % 3) as 0 | 1 | 2 : -1, weaponDelta: 0,
});
const run = (m: Match, from: number, to: number): void => {
  for (let n = from; n <= to; n++) step(m, new Map([[0, inputAt(n, 0)], [1, inputAt(n, 1)]]));
};

/** every mutable value of the match as plain data, to compare two matches completely */
function everything(m: Match): unknown {
  const out: Record<string, unknown> = {};
  for (const k of COPIED_FIELDS) out[k] = k === 'rng' ? m.rng.getState() : (m as unknown as Record<string, unknown>)[k];
  return JSON.parse(JSON.stringify(out));
}

describe('cloneMatch', () => {
  it('lists every Match field exactly once as shared or copied (a new field must be classified)', () => {
    const m = createMatch(OPTS, REAL_MAPS[3]!, 5, REAL_ASSETS, botHooks);
    const listed = [...SHARED_FIELDS, ...COPIED_FIELDS].sort();
    expect(new Set(listed).size).toBe(listed.length);
    expect(Object.keys(m).sort()).toEqual(listed);
  });

  it('a copy evolves exactly like the original given the same inputs, and stepping it leaves the original alone', () => {
    const m = createMatch(OPTS, REAL_MAPS[3]!, 99, REAL_ASSETS, botHooks);
    run(m, 1, 150);
    const copy = cloneMatch(m);
    const before = JSON.stringify(everything(m));
    run(copy, 151, 400); // the copy runs ahead...
    expect(JSON.stringify(everything(m))).toBe(before); // ...without touching the original
    run(m, 151, 400);
    expect(everything(copy)).toEqual(everything(m)); // and both end identical (rng, fighters, items, projectiles, tram...)
  });

  it('replaying from a copy after a correction reaches the corrected state', () => {
    const m = createMatch(OPTS, REAL_MAPS[3]!, 7, REAL_ASSETS, botHooks);
    run(m, 1, 100);
    const predicted = cloneMatch(m);
    for (let n = 101; n <= 104; n++) step(predicted, new Map([[0, inputAt(n, 0)], [1, inputAt(n, 1)]])); // predicted: remote kept its old input
    const truth = cloneMatch(m);
    for (let n = 101; n <= 104; n++) step(truth, new Map([[0, inputAt(n, 0)], [1, inputAt(n + 50, 1)]])); // server: remote did something else
    const rebuilt = cloneMatch(m);
    for (let n = 101; n <= 104; n++) step(rebuilt, new Map([[0, inputAt(n, 0)], [1, inputAt(n + 50, 1)]]));
    expect(everything(rebuilt)).toEqual(everything(truth));
  });
});
