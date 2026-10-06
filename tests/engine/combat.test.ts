import { describe, expect, it } from 'vitest';
import { advanceWeapon, startFire, stepProjectiles } from '../../src/engine/combat';
import { scanPickups, stepRespawns } from '../../src/engine/items';
import { applyDamage, respawnFighter } from '../../src/engine/lifecycle';
import { CMD_FIRE, type Match } from '../../src/engine/types';
import { stepFighterPhysics } from '../../src/engine/physics';
import { duel, place, roomMatch, roomMatchWith, syncWindow } from './helpers';

function twoFighters(): Match {
  const m = roomMatch();
  duel(m);
  place(m.fighters[0]!, 100, 160, true);
  place(m.fighters[1]!, 110, 160, true);
  return m;
}

describe('weapons', () => {
  it('saw hits a close enemy for 20-50 on its 3rd reload tick', () => {
    const m = twoFighters();
    const a = m.fighters[0]!;
    a.currentWeapon = 0;
    a.headsLeft = false;
    startFire(m, a, CMD_FIRE);
    expect(a.weaponState).toBe(8);
    for (let i = 0; i < 2; i++) advanceWeapon(m, a);
    expect(m.fighters[1]!.hp).toBe(100);
    advanceWeapon(m, a);
    const dmg = 100 - m.fighters[1]!.hp;
    expect(dmg).toBeGreaterThanOrEqual(20);
    expect(dmg).toBeLessThanOrEqual(50);
  });

  it('laser costs 1 battery, deals 10-20 and leaves a ray ending at the target', () => {
    const m = twoFighters();
    const a = m.fighters[0]!;
    a.currentWeapon = 1;
    a.ammo[1] = 25;
    startFire(m, a, CMD_FIRE);
    expect(a.weaponState).toBe(5);
    for (let i = 0; i < 2; i++) advanceWeapon(m, a);
    expect(a.ammo[1]).toBe(24);
    const dmg = 100 - m.fighters[1]!.hp;
    expect(dmg).toBeGreaterThanOrEqual(10);
    expect(dmg).toBeLessThanOrEqual(20);
    expect(m.rays).toHaveLength(1);
    expect(m.rays[0]!.x2).toBe(110);
  });

  it('bazooka fires a 5 px/tick rocket that explodes on an enemy for 60-100', () => {
    const m = roomMatch();
    duel(m);
    const a = m.fighters[0]!;
    const b = m.fighters[1]!;
    place(a, 60, 160, true);
    place(b, 140, 160, true);
    a.currentWeapon = 2;
    a.weaponPresent[2] = true;
    a.ammo[2] = 3;
    a.headsLeft = false;
    startFire(m, a, CMD_FIRE);
    expect(a.weaponState).toBe(15);
    for (let i = 0; i < 3; i++) advanceWeapon(m, a);
    expect(a.ammo[2]).toBe(2);
    expect(m.projectiles).toHaveLength(1);
    expect(m.projectiles[0]!.v).toBe(5);
    for (let i = 0; i < 40 && m.projectiles.length > 0; i++) {
      m.tick++;
      stepProjectiles(m);
    }
    expect(m.projectiles).toHaveLength(0);
    const dmg = 100 - b.hp;
    expect(dmg).toBeGreaterThanOrEqual(60);
    expect(dmg).toBeLessThanOrEqual(100);
  });

  it('switches to the other weapon when the current one runs dry', () => {
    const m = twoFighters();
    const a = m.fighters[0]!;
    a.currentWeapon = 1;
    a.ammo[1] = 1;
    startFire(m, a, CMD_FIRE);
    for (let i = 0; i < 5; i++) advanceWeapon(m, a);
    expect(a.ammo[1]).toBe(0);
    expect(a.currentWeapon).toBe(0); // no bazooka: falls back to the saw
  });
});

describe('damage and scoring', () => {
  it('armor absorbs a share of damage', () => {
    const m = twoFighters();
    const v = m.fighters[1]!;
    v.armor = 100;
    applyDamage(m, 0, v, 40, false, false);
    const absorbed = 100 - v.armor;
    expect(absorbed).toBeGreaterThanOrEqual(10);
    expect(absorbed).toBeLessThanOrEqual(30);
    expect(v.hp).toBe(100 - 40 + absorbed);
  });

  it('a kill gives +1 frag and a suicide -1', () => {
    const m = twoFighters();
    applyDamage(m, 0, m.fighters[1]!, 200, false, false);
    expect(m.score[0]).toBe(1);
    applyDamage(m, 0, m.fighters[0]!, 200, false, false);
    expect(m.score[0]).toBe(0);
  });

  it('a dead fighter respawns after its death animation with starting kit', () => {
    const m = roomMatchWith({
      nodes: [{ type: 0, x: 64, y: 160, left: -1, right: -1, top: -1, flags: 0 }],
      dmBlue: [0],
    });
    duel(m);
    const a = m.fighters[0]!;
    a.starts = m.map.dmBlue;
    place(a, 100, 160, true);
    a.ammo[1] = 3;
    a.currentWeapon = 0;
    applyDamage(m, 1, a, 500, true, false);
    expect(a.hp).toBeLessThanOrEqual(0);
    for (let i = 0; i < 40 && a.hp <= 0; i++) stepFighterPhysics(m, a, 0);
    expect(a.hp).toBe(100);
    expect(a.ammo[1]).toBe(25);
    expect(a.currentWeapon).toBe(1);
    expect(a.x).toBe(64);
  });

  it('respawn spot choice is deterministic per seed', () => {
    const mk = () => {
      const m = roomMatchWith({
        nodes: [0, 1, 2, 3].map((i) => ({ type: 0, x: 40 + i * 40, y: 160, left: -1, right: -1, top: -1, flags: 0 })),
        dmBlue: [0, 1, 2, 3],
      }, {}, 77);
      duel(m);
      m.fighters[0]!.starts = m.map.dmBlue;
      return m;
    };
    const a = mk();
    const b = mk();
    const xs = (m: Match) => Array.from({ length: 6 }, () => (respawnFighter(m, m.fighters[0]!), m.fighters[0]!.x));
    expect(xs(a)).toEqual(xs(b));
  });
});

describe('pickups', () => {
  const medikit = { type: 5, x: 100, y: 160, data1: 10 };
  it('medikit gives +25 hp up to 100 and respawns after 250 ticks', () => {
    const m = roomMatchWith({ pobjs: [medikit] });
    duel(m, 1);
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    f.hp = 50;
    scanPickups(m, f, 0);
    expect(f.hp).toBe(75);
    expect(m.pobjs[0]!.type).toBe(5 | 0x40);
    m.tick = 249;
    stepRespawns(m);
    expect(m.pobjs[0]!.type).toBe(5 | 0x40);
    m.tick = 250;
    stepRespawns(m);
    expect(m.pobjs[0]!.type).toBe(5);
  });

  it('a healthy fighter leaves the medikit alone', () => {
    const m = roomMatchWith({ pobjs: [medikit] });
    duel(m, 1);
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    scanPickups(m, f, 0);
    expect(m.pobjs[0]!.type).toBe(5);
  });

  it('"No medikits" removes medikits from the map', () => {
    const m = roomMatchWith({ pobjs: [medikit] }, { noMedikits: true });
    expect(m.pobjs[0]!.type & 0x40).toBe(0x40);
  });

  it('rocket pickup grants the bazooka and selects it', () => {
    const m = roomMatchWith({ pobjs: [{ type: 6, x: 100, y: 160, data1: 10 }] });
    duel(m, 1);
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    f.ammo[2] = 0;
    scanPickups(m, f, 0);
    expect(f.ammo[2]).toBe(2);
    expect(f.pendingWeapon).toBe(2);
  });
});

describe('pickup sounds', () => {
  const sound = (type: number) => {
    const m = roomMatchWith({ pobjs: [{ type, x: 100, y: 160, data1: 10 }] });
    duel(m, 1);
    const f = m.fighters[0]!;
    place(f, 100, 160, true);
    syncWindow(m, f);
    f.hp = 50;
    f.armor = 0;
    f.ammo[1] = 0;
    f.ammo[2] = 0;
    scanPickups(m, f, 0);
    return m.events.filter((e) => e.kind === 'sound').map((e) => (e as { name: string }).name);
  };
  it('weapons and ammo sound like reloading, health and armor like a soft chime', () => {
    expect(sound(4)).toEqual(['weapon']); // bazooka
    expect(sound(6)).toEqual(['ammo']); // rocket
    expect(sound(8)).toEqual(['ammo']); // battery
    expect(sound(5)).toEqual(['pickup']); // medikit
    expect(sound(7)).toEqual(['pickup']); // armor
  });
});
