import { describe, expect, it } from 'vitest';
import { stepProjectiles } from '../../src/engine/combat';
import type { Match } from '../../src/engine/types';
import { duel, place, roomMatch } from './helpers';

/** Rocket that detonates on the next tick at (blastX, blastY); fighters 1.. stand at the given x offsets from the blast. */
function blast(offsets: number[], blastY = 150, owner = 0): Match {
  const m = roomMatch({}, 3);
  duel(m, offsets.length + 1);
  place(m.fighters[0]!, 20, 160, true); // shooter far away unless an offset says otherwise
  const bx = 105; // projectile moves 5 and passes its range limit (90) => explodes at x = 105
  offsets.forEach((dx, i) => place(m.fighters[i + 1]!, bx + dx, 160, true));
  m.projectiles.push({ type: 56, x: 100, y: blastY, v: 5, owner, ownerNumber: owner, selfLiq: 90 });
  stepProjectiles(m);
  return m;
}
const lost = (m: Match, i: number) => 100 - m.fighters[i]!.hp;

describe('rocket explosion radius', () => {
  it('full 60-100 damage within 6 px', () => {
    const m = blast([5]);
    expect(lost(m, 1)).toBeGreaterThanOrEqual(60);
    expect(lost(m, 1)).toBeLessThanOrEqual(100);
  });

  it('damage falls off linearly from 6 px: (d-6)/16 of the roll', () => {
    const mid = blast([14]); // 8/16 => 30..50
    expect(lost(mid, 1)).toBeGreaterThanOrEqual(30);
    expect(lost(mid, 1)).toBeLessThanOrEqual(50);
    const edge = blast([21]); // 15/16 => 56..93
    expect(lost(edge, 1)).toBeGreaterThanOrEqual(56);
    expect(lost(edge, 1)).toBeLessThanOrEqual(93);
  });

  it('nobody 22 px or more away is hurt (both sides of the blast)', () => {
    const m = blast([22, -22, 40]);
    expect(lost(m, 1)).toBe(0);
    expect(lost(m, 2)).toBe(0);
    expect(lost(m, 3)).toBe(0);
  });

  it('a fighter running away is still caught by the radius', () => {
    const near = blast([18]);
    expect(lost(near, 1)).toBeGreaterThan(0);
  });

  it('hurts the shooter and teammates too', () => {
    const m = roomMatch({}, 3);
    duel(m, 2);
    m.fighters[1]!.side = 0; // teammate
    place(m.fighters[0]!, 112, 160, true);
    place(m.fighters[1]!, 110, 160, true);
    m.projectiles.push({ type: 56, x: 100, y: 150, v: 5, owner: 0, ownerNumber: 0, selfLiq: 90 });
    stepProjectiles(m);
    expect(100 - m.fighters[0]!.hp).toBeGreaterThan(0);
    expect(100 - m.fighters[1]!.hp).toBeGreaterThan(0);
  });

  it('uses box distance vertically: a blast below the feet still reaches, far above the head does not', () => {
    expect(lost(blast([0], 175), 1)).toBeGreaterThan(0); // 15 px below the feet
    expect(lost(blast([0], 190), 1)).toBe(0); // 30 px below
    expect(lost(blast([0], 100), 1)).toBe(0); // 28 px above the head
  });

  it('the shared damage roll shrinks for later victims in the same blast (original quirk)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = roomMatch({}, seed);
      duel(m, 3);
      place(m.fighters[0]!, 20, 160, true);
      place(m.fighters[1]!, 105 + 12, 160, true);
      place(m.fighters[2]!, 105 - 12, 160, true);
      m.projectiles.push({ type: 56, x: 100, y: 150, v: 5, owner: 0, ownerNumber: 0, selfLiq: 90 });
      stepProjectiles(m);
      const first = 100 - m.fighters[1]!.hp;
      const second = 100 - m.fighters[2]!.hp;
      expect(second).toBeLessThanOrEqual(first);
      if (second < first) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a killing blast emits the heavy death sound and the explosion', () => {
    const m = roomMatch({}, 9);
    duel(m, 2);
    place(m.fighters[0]!, 20, 160, true);
    place(m.fighters[1]!, 105, 160, true);
    m.fighters[1]!.hp = 5;
    m.projectiles.push({ type: 56, x: 100, y: 150, v: 5, owner: 0, ownerNumber: 0, selfLiq: 90 });
    stepProjectiles(m);
    const names = m.events.filter((e) => e.kind === 'sound').map((e) => (e as { name: string }).name);
    expect(names).toContain('explosion');
    expect(names).toContain('diehard');
  });
});
