import { describe, expect, it } from 'vitest';
import { scanPickups } from '../../src/engine/items';
import { createMatch } from '../../src/engine/match';
import { CMD_ACTION } from '../../src/engine/types';
import { stepLifts } from '../../src/engine/vehicles';
import { place, syncWindow } from './helpers';
import { DM_OPTS, REAL_ASSETS, REAL_MAPS } from './real';

interface Report { map: number; anchor: number; from: 'upper' | 'lower'; ok: boolean; why: string }

function ride(mapId: number, anchor: number, from: 'upper' | 'lower'): Report {
  const opts = { ...DM_OPTS, mapId, bots: 0 };
  const m = createMatch(mapId < 7 ? opts : { ...opts, mode: 'ctf', team: false }, REAL_MAPS[mapId]!, 1, REAL_ASSETS);
  const [a, up, low] = [m.pobjs[anchor]!, m.pobjs[anchor + 1]!, m.pobjs[anchor + 2]!];
  const [carStop, otherStop] = from === 'upper' ? [up, low] : [low, up];
  // car waits at `from`
  a.y = carStop.y;
  carStop.type = 16;
  otherStop.type = 9;
  a.type = 1;
  const f = m.fighters[0]!;
  place(f, carStop.x, carStop.y, true);
  syncWindow(m, f);
  const bad = (why: string): Report => ({ map: mapId, anchor, from, ok: false, why });
  scanPickups(m, f, CMD_ACTION);
  if (!f.isPassenger) return bad(`did not board (stop type ${carStop.type}, v=${f.v}, data1=${carStop.data1})`);
  for (let t = 0; t < 400 && f.isPassenger; t++) {
    m.tick++;
    stepLifts(m);
    if (f.isPassenger && (f.y !== a.y || f.x !== a.x)) return bad(`rider (${f.x},${f.y}) vs car (${a.x},${a.y}) at tick ${t}`);
  }
  if (f.isPassenger) return bad('never arrived');
  if (f.y !== otherStop.y) return bad(`arrived at y=${f.y}, expected ${otherStop.y}`);
  return { map: mapId, anchor, from, ok: true, why: '' };
}

describe('every lift on every map', () => {
  const cases: [number, number, 'upper' | 'lower'][] = [];
  REAL_MAPS.forEach((map) => map.pobjs.forEach((p, i) => { if (p.type === 1) { cases.push([map.id, i, 'upper'], [map.id, i, 'lower']); } }));
  it('there are lifts to test', () => expect(cases.length).toBeGreaterThan(20));
  it.each(cases)('map %i lift #%i from the %s stop carries the rider with the car', (mapId, anchor, from) => {
    const r = ride(mapId, anchor, from);
    expect(r.why).toBe('');
  });
});
