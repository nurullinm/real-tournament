import { describe, expect, it, vi } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import { GameSession, type FrameInfo } from '../../src/game/session';
import { computeLayout } from '../../src/input/layout';
import { NO_INPUT, type Match } from '../../src/engine/types';
import { DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';
import { place, syncWindow } from '../engine/helpers';

const probe = vi.hoisted(() => ({ onActors: (_m: unknown) => {} }));
vi.mock('../../src/render/fighters', () => ({ drawActors: (_ctx: unknown, m: unknown) => probe.onActors(m), drawFighter: () => {} }));

const img = {} as ImageBitmap;
const sprites = { tiles: img, energy: img, sheets: [img, img, img, img], chars: loadCharsFromDisk('public/original') } as unknown as Sprites;
const safe = { l: 0, r: 0, t: 0, b: 0 };
const info: FrameInfo = { w: 956, h: 440, dpr: 2, safe, layout: computeLayout(956, 440, safe), held: new Set(), stick: { active: false, x: 0, y: 0 }, showControls: false };
const ctx = new Proxy({ canvas: { width: 1912, height: 880 } }, {
  get: (t, name: string) => (name in t ? (t as Record<string, unknown>)[name] : () => {}),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

describe('lift rendering', () => {
  it('the car (drawn with the world) and its passenger (drawn with the actors) share one height between ticks', () => {
    const s = new GameSession({ ...DM_OPTS, bots: 0 }, 1, {
      sprites, assets: REAL_ASSETS, maps: REAL_MAPS,
      audio: { init() {}, unlock: async () => {}, running: true, nowPlaying: null, play() {}, playMusic() {}, setEnabled() {}, suspend() {}, resume() {} },
      platform: { haptic() {} } as never,
    });
    const m = s.match;
    const anchor = 1; // map 0: lift at x=96, upper stop y=128, lower stop y=240
    m.pobjs[anchor]!.y = 240;
    m.pobjs[anchor + 1]!.type = 9;
    m.pobjs[anchor + 2]!.type = 16;
    const f = m.fighters[0]!;
    place(f, 96, 240, true);
    syncWindow(m, f);

    const seen: string[] = [];
    let checks = 0;
    probe.onActors = (mm) => {
      const match = mm as Match;
      if (f.isPassenger) {
        checks++;
        if (match.pobjs[anchor]!.y !== f.y) seen.push(`car ${match.pobjs[anchor]!.y} vs rider ${f.y}`);
      }
    };
    s.tick({ ...NO_INPUT, action: true });
    expect(f.isPassenger).toBe(true);
    let rode = 0;
    for (let t = 0; t < 60 && f.isPassenger; t++) {
      s.tick(NO_INPUT);
      for (const alpha of [0, 0.25, 0.5, 0.75]) s.draw(ctx, info, alpha);
      rode++;
    }
    expect(rode).toBeGreaterThan(5);
    expect(checks).toBeGreaterThan(20);
    expect(seen).toEqual([]);
    expect(m.pobjs[anchor]!.y).toBe(f.y); // drawing leaves the simulation untouched
  });

  it('a tram and its passenger share one position between ticks', () => {
    const s = new GameSession({ ...DM_OPTS, bots: 0, mapId: 2 }, 1, {
      sprites, assets: REAL_ASSETS, maps: REAL_MAPS,
      audio: { init() {}, unlock: async () => {}, running: true, nowPlaying: null, play() {}, playMusic() {}, setEnabled() {}, suspend() {}, resume() {} },
      platform: { haptic() {} } as never,
    });
    const m = s.match;
    const stop = m.pobjs.find((p) => p.type === 40 && p.x === m.tram.x1)!;
    m.tram.x = m.tram.x1;
    m.tram.state = 0;
    m.tram.speed = 100; // waiting at the stop long enough to board
    const f = m.fighters[0]!;
    // the stop sits over the tram pit: boarding happens from the solid floor 8 px beside it (pickup window is +-12 px)
    place(f, stop.x - 8, stop.y, true);
    syncWindow(m, f);
    const seen: string[] = [];
    let checks = 0;
    let boardTick = -1;
    probe.onActors = (mm) => {
      const match = mm as Match;
      if (f.isPassenger && boardTick < 0) boardTick = match.tick;
      // on the boarding tick the original also leaves the rider 8 px beside the tram until the next tram step, then slides in over one tick
      if (f.isPassenger && match.tick > boardTick + 1) {
        checks++;
        if (match.tram.x !== f.x) seen.push(`tram ${match.tram.x} vs rider ${f.x}`);
      }
    };
    for (let t = 0; t < 80; t++) {
      s.tick(NO_INPUT);
      for (const alpha of [0, 0.5]) s.draw(ctx, info, alpha);
    }
    expect(checks).toBeGreaterThan(10);
    expect(seen).toEqual([]);
  });
});
