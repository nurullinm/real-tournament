import { describe, expect, it } from 'vitest';
import type { Sprites } from '../../src/assets/sprites';
import type { Audio } from '../../src/audio/audio';
import { botHooks } from '../../src/bots';
import { cloneMatch } from '../../src/engine/clone';
import { createMatch, step } from '../../src/engine/match';
import { NO_INPUT, type InputState, type Match, type MatchOptions } from '../../src/engine/types';
import { GameSession, type SessionDeps } from '../../src/game/session';
import { Lockstep } from '../../src/net/lockstep';
import { TickClock } from '../../src/net/clock';
import type { Platform } from '../../src/platform/telegram';
import { REAL_ASSETS, REAL_MAPS } from '../engine/real';

const audio = { init() {}, unlock: async () => {}, running: true, nowPlaying: null, play: () => {}, playMusic: () => {}, setEnabled: () => {}, suspend: () => {}, resume: () => {}, poke: () => {}, debug: () => '' } as Audio;
const deps: SessionDeps = { sprites: {} as Sprites, audio, platform: { haptic: () => {} } as unknown as Platform, assets: REAL_ASSETS, maps: REAL_MAPS };
const OPTS: MatchOptions = { mapId: 3, mode: 'dm', skill: 2, bots: 3, fragLimit: 0, noMedikits: false, violence: true, team: false, playerColor: 0, humans: 2 };
const NAMES = ['Me', 'Friend', '', ''];

const input = (c: number): InputState => ({ ...NO_INPUT, left: (c & 4) !== 0, right: (c & 0x20) !== 0, jump: (c & 2) !== 0, fire: (c & 0x100) !== 0 });
/** what each human does at tick n (the "truth" the server broadcasts) */
const mine = (n: number): number => (n >> 3) % 3 === 0 ? 0x20 : (n >> 3) % 3 === 1 ? 0x24 | 0x100 : 0;
const theirs = (n: number): number => (n >> 2) % 4 === 0 ? 4 : (n >> 2) % 4 === 1 ? 0x20 : 2;
const wire = (c: number) => ({ c, ws: -1 as const, wd: 0 as const });

function reference(upTo: number): Match {
  const m = createMatch(OPTS, REAL_MAPS[3]!, 4242, REAL_ASSETS, botHooks);
  for (let n = 1; n <= upTo; n++) step(m, new Map([[0, input(mine(n))], [1, input(theirs(n))]]));
  return m;
}
const state = (m: Match) => JSON.parse(JSON.stringify({ t: m.tick, f: m.fighters.slice(0, 4).map((f) => [f.x, f.y, f.hp, f.currentWeapon, f.frame]), s: m.score, r: m.rng.getState() }));

describe('client-side prediction', () => {
  const newSession = () => new GameSession(OPTS, 4242, deps, 0, NAMES);

  it('confirmed ticks alone give exactly the lockstep state, and the picture runs ahead of them', () => {
    const s = newSession();
    const ls = new Lockstep([0, 1]);
    for (let n = 1; n <= 60; n++) {
      ls.push(n, [wire(mine(n)), wire(theirs(n))]);
      s.setLocalInput(input(mine(n)));
      s.tickNet(ls.pull()!);
      s.predictTo(n + 3); // three ticks of latency
    }
    expect(state(s.authoritative)).toEqual(state(reference(60)));
    expect(s.match.tick).toBe(63); // the shown simulation is 3 ticks ahead
    expect(s.authoritative.tick).toBe(60);
  });

  it('the local fighter reacts at once: a held direction moves him before the server has confirmed it', () => {
    const s = newSession();
    const x0 = s.match.fighters[0]!.x;
    s.setLocalInput(input(0x20)); // holding right
    s.predictTo(4);
    expect(s.authoritative.fighters[0]!.x).toBe(x0); // nothing confirmed yet
    expect(s.match.fighters[0]!.x).toBeGreaterThan(x0); // but the player already sees himself running
  });

  it('a wrong guess about another human is corrected: after the real ticks arrive, shown equals the true state', () => {
    const s = newSession();
    const ls = new Lockstep([0, 1]);
    // the friend changes what he does every few ticks; prediction assumes he keeps the last confirmed input
    for (let n = 1; n <= 80; n++) {
      s.setLocalInput(input(mine(n)));
      s.predictTo(n + 4);
      if (n > 4) { const k = n - 4; ls.push(k, [wire(mine(k)), wire(theirs(k))]); s.tickNet(ls.pull()!); }
    }
    for (let k = 77; k <= 80; k++) { ls.push(k, [wire(mine(k)), wire(theirs(k))]); s.tickNet(ls.pull()!); }
    s.predictTo(84); // still four ticks ahead
    expect(state(s.authoritative)).toEqual(state(reference(80)));
    // the picture = the confirmed state at tick 80 replayed with the input I held when each tick was predicted (4 ticks earlier) and the friend's last confirmed input
    const expected = cloneMatch(reference(80));
    for (let n = 81; n <= 84; n++) step(expected, new Map([[0, input(mine(n - 4))], [1, input(theirs(80))]]));
    expect(s.match.tick).toBe(84);
    expect(state(s.match)).toEqual(state(expected));
  });

  it('prediction never changes the confirmed simulation', () => {
    const a = newSession();
    const b = newSession();
    const ls = new Lockstep([0, 1]);
    const lb = new Lockstep([0, 1]);
    for (let n = 1; n <= 50; n++) {
      ls.push(n, [wire(mine(n)), wire(theirs(n))]);
      lb.push(n, [wire(mine(n)), wire(theirs(n))]);
      a.setLocalInput(input(0x2)); // wildly wrong local guesses...
      a.predictTo(n + 6);
      a.tickNet(ls.pull()!);
      b.tickNet(lb.pull()!); // ...versus a client that never predicts
    }
    expect(state(a.authoritative)).toEqual(state(b.authoritative));
  });

  it('weapon pulses are used by the prediction once, at the tick they were pressed', () => {
    const s = newSession();
    s.setLocalInput({ ...NO_INPUT, weaponSelect: 0 });
    s.predictTo(1);
    expect(s.match.fighters[0]!.currentWeapon).toBe(0);
    s.setLocalInput(NO_INPUT);
    s.predictTo(2);
    expect(s.match.tick).toBe(2);
  });
});

describe('TickClock', () => {
  it('runs the prediction one round trip plus a tick ahead of the newest tick heard, and never beyond the cap', () => {
    const c = new TickClock();
    c.rtt = 120;
    c.onTick(10, 1000);
    expect(c.target(1000)).toBe(10 + Math.floor(120 / 60 + 1)); // 13
    expect(c.target(1060)).toBe(14); // a tick later in real time
    c.onTick(11, 1060); // the next tick arrives: the target does not jump back
    expect(c.target(1060)).toBe(14);
    expect(c.target(1_000_000)).toBe(11 + 12); // capped
  });

  it('smooths the round-trip time from pongs', () => {
    const c = new TickClock();
    c.rtt = 100;
    c.onPong(0, 200);
    expect(c.rtt).toBeGreaterThan(100);
    expect(c.rtt).toBeLessThan(200);
  });
});
