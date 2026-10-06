import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { CMD_JUMP, CMD_LEFT, stepFighterPhysics } from '../../src/engine/physics';
import { computeCells } from '../../src/engine/world';
import { makeMap, place, roomMatch, ROOM, TEST_ASSETS } from './helpers';

describe('cell flags', () => {
  it('marks solid tiles 3, the tile under a solid tile 2, and edge columns blocking', () => {
    const map = makeMap(['#.#', '...', '###', '###']);
    const { cell } = computeCells(map, TEST_ASSETS.passable);
    expect(cell[0]![0]! & 3).toBe(3);
    expect(cell[1]![0]!).toBe(2 | 2); // under solid tile and left edge
    expect(cell[1]![1]! & 2).toBe(0);
    expect(cell[0]![2]! & 2).toBe(2); // right edge column blocks
  });
  it('reachLeft/reachRight stop at solid tiles', () => {
    const { reachLeft, reachRight } = computeCells(makeMap(ROOM), TEST_ASSETS.passable);
    expect(reachLeft[9]![10]).toBe(1 - 1); // row of the body: only edge flag bit1, bit0 clear => reach 0
    expect(reachLeft[10]![10]).toBe(10); // solid floor tile: reach is its own column
    expect(reachRight[10]![3]).toBe(3);
  });
});

describe('fighter physics', () => {
  it('falls under gravity and lands on the floor', () => {
    const m = roomMatch();
    const f = m.fighters[0]!;
    place(f, 160, 100, false);
    let ticks = 0;
    while (!f.hasSupport && ticks < 100) {
      stepFighterPhysics(m, f, 0);
      ticks++;
    }
    expect(f.hasSupport).toBe(true);
    expect(f.y).toBe(160);
    stepFighterPhysics(m, f, 0); // the original clears vertical speed on the first supported tick
    expect(f.yspeedFix).toBe(0);
    expect(ticks).toBeLessThan(40);
  });

  it('reaches the original jump height (45 px) when jump is held', () => {
    const m = roomMatch();
    const f = m.fighters[0]!;
    place(f, 160, 160, true);
    let minY = f.y;
    for (let i = 0; i < 60; i++) {
      stepFighterPhysics(m, f, CMD_JUMP);
      minY = Math.min(minY, f.y);
    }
    expect(160 - minY).toBe(45);
  });

  it('short-hops lower when jump is released', () => {
    const m = roomMatch();
    const f = m.fighters[0]!;
    place(f, 160, 160, true);
    stepFighterPhysics(m, f, CMD_JUMP);
    let minY = f.y;
    for (let i = 0; i < 40; i++) {
      stepFighterPhysics(m, f, 0);
      minY = Math.min(minY, f.y);
    }
    expect(160 - minY).toBeLessThan(45);
  });

  it('cannot walk through a wall and stops at the tile edge', () => {
    const m = roomMatch();
    const f = m.fighters[0]!;
    place(f, 40, 160, true);
    for (let i = 0; i < 30; i++) stepFighterPhysics(m, f, CMD_LEFT);
    expect(f.x).toBeGreaterThanOrEqual(16);
    expect(f.u).toBe(1);
  });

  it('walks 3 px per tick on the ground', () => {
    const m = roomMatch();
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    stepFighterPhysics(m, f, CMD_LEFT);
    expect(f.x).toBe(97);
    expect(f.headsLeft).toBe(true);
  });
});

describe('rng', () => {
  it('same seed gives the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('range stays inside [a, b]', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.range(20, 50);
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(50);
    }
  });
});
