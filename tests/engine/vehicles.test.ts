import { describe, expect, it } from 'vitest';
import { scanPickups } from '../../src/engine/items';
import { CMD_ACTION, CMD_LEFT, CMD_RIGHT } from '../../src/engine/types';
import { moveCyclist, stepLifts, stepTram } from '../../src/engine/vehicles';
import { duel, place, roomMatchWith, syncWindow } from './helpers';

/** Lift shaft at x=100: anchor (idx 0), upper stop y=80 (idx 1), lower stop y=160 (idx 2). */
const SHAFT = [
  { type: 1, x: 100, y: 0, data1: 0 },
  { type: 9, x: 100, y: 80, data1: 5 },
  { type: 9, x: 100, y: 160, data1: 10 },
];

function liftMatch() {
  const m = roomMatchWith({ pobjs: SHAFT });
  duel(m, 1);
  // force the car to the lower stop regardless of the seed
  m.pobjs[0]!.y = 160;
  m.pobjs[1]!.type = 9;
  m.pobjs[2]!.type = 16;
  return m;
}

describe('lifts', () => {
  it('action at the car boards the fighter and carries them to the other floor', () => {
    const m = liftMatch();
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    scanPickups(m, f, CMD_ACTION);
    expect(f.isPassenger).toBe(true);
    expect(m.pobjs[2]!.type).toBe(12);
    let prev = f.y;
    for (let i = 0; i < 200 && f.isPassenger; i++) {
      m.tick++;
      stepLifts(m);
      expect(f.y).toBeLessThanOrEqual(prev); // only goes up
      prev = f.y;
    }
    expect(f.isPassenger).toBe(false);
    expect(f.y).toBe(80);
    expect(m.pobjs[1]!.type).toBe(16); // car now waits at the upper stop
    expect(m.pobjs[2]!.type).toBe(9); // lower stop is a call button again
  });

  it('pressing the call button at the lower stop summons the car from the top', () => {
    const m = liftMatch();
    m.pobjs[0]!.y = 80;
    m.pobjs[1]!.type = 16;
    m.pobjs[2]!.type = 9;
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    scanPickups(m, f, CMD_ACTION);
    expect(m.pobjs[1]!.type).toBe(12);
    for (let i = 0; i < 200 && m.pobjs[2]!.type !== 16; i++) {
      m.tick++;
      stepLifts(m);
    }
    expect(m.pobjs[2]!.type).toBe(16);
    expect(m.pobjs[0]!.y).toBe(160);
  });
});

describe('cycles', () => {
  const cycleMap = {
    cycle: { x1: 64, y1: 64, x2: 256, y2: 144 },
    nodes: [{ type: 3, x: 40, y: 100, left: -1, right: -1, top: -1, flags: 0 }],
    pobjs: [{ type: 2, x: 40, y: 100, data1: 6 }],
    docksLeft: [{ node: 0, pobj: 0 }],
    docksRight: [],
  };

  it('accelerates 256/tick up to 1792 and moves xspeed>>8 px per tick', () => {
    const m = roomMatchWith(cycleMap);
    duel(m, 1);
    const f = m.fighters[0]!;
    f.isCycling = true;
    place(f, 100, 100, false);
    const start = f.x;
    for (let i = 0; i < 7; i++) moveCyclist(m, f, CMD_RIGHT);
    expect(f.x - start).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7);
    expect(f.xspeed).toBe(1792);
    for (let i = 0; i < 5; i++) moveCyclist(m, f, CMD_RIGHT);
    expect(f.xspeed).toBe(1792);
  });

  it('is clamped to the cycle area on the right', () => {
    const m = roomMatchWith(cycleMap);
    duel(m, 1);
    const f = m.fighters[0]!;
    f.isCycling = true;
    place(f, 250, 100, false);
    for (let i = 0; i < 20; i++) moveCyclist(m, f, CMD_RIGHT);
    expect(f.x).toBe(256);
  });

  it('dismounts at a dock when pushing outward at the area edge', () => {
    const m = roomMatchWith(cycleMap);
    duel(m, 1);
    const f = m.fighters[0]!;
    f.isCycling = true;
    place(f, 64, 100, false);
    moveCyclist(m, f, CMD_LEFT);
    expect(f.isCycling).toBe(false);
    expect(f.hasSupport).toBe(true);
    expect(f.y).toBe(100);
    expect(f.x).toBe(39);
    expect(m.pobjs[0]!.type).toBe(2);
  });
});

describe('tram', () => {
  const tramMap = { tram: { x1: 100, x2: 160, y: 160 } };

  it('starts moving after its wait and crushes grounded fighters at the far stop', () => {
    const m = roomMatchWith(tramMap);
    m.tram.x = 100;
    m.tram.speed = 1;
    duel(m, 2);
    const victim = m.fighters[1]!;
    place(victim, 170, 160, true);
    let arrived = false;
    for (let i = 0; i < 120 && !arrived; i++) {
      m.tick++;
      stepTram(m);
      arrived = m.tram.state === 3;
    }
    expect(arrived).toBe(true);
    expect(m.tram.x).toBe(160);
    expect(victim.hp).toBeLessThanOrEqual(0);
  });

  it('a boarded passenger rides at the tram position', () => {
    const m = roomMatchWith({ ...tramMap, pobjs: [{ type: 40, x: 100, y: 160, data1: 10 }] });
    m.tram.x = 100;
    m.tram.state = 0;
    m.tram.speed = 1;
    duel(m, 1);
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    scanPickups(m, f, 0);
    expect(f.isPassenger).toBe(true);
    expect(m.tram.state).toBe(2);
    for (let i = 0; i < 5; i++) {
      stepTram(m);
      expect(f.x).toBe(m.tram.x);
    }
    expect(f.x).toBeGreaterThan(100);
  });

  it('is inert on maps without a tram', () => {
    const m = roomMatchWith({});
    for (let i = 0; i < 10; i++) stepTram(m);
    expect(m.tram.state).toBe(0);
  });
});
