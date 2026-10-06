import { describe, expect, it } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import type { Audio } from '../../src/audio/audio';
import { botInput } from '../../src/bots';
import { GameSession, type FrameInfo, type SessionDeps } from '../../src/game/session';
import { computeLayout } from '../../src/input/layout';
import type { Platform } from '../../src/platform/telegram';
import { setLang } from '../../src/i18n';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

const img = {} as ImageBitmap;
const sprites = { tiles: img, energy: img, sheets: [img, img, img, img], chars: loadCharsFromDisk('public/original') } as unknown as Sprites;

function recorder() {
  const draws = { images: 0, rects: 0, texts: 0 };
  const canvas = { width: 0, height: 0 };
  const ctx = new Proxy({ canvas }, {
    get: (t, name: string) => {
      if (name in t) return (t as Record<string, unknown>)[name];
      return (..._a: unknown[]) => {
        if (name === 'measureText') return { width: String(_a[0]).length * 7 };
        if (name === 'drawImage') draws.images++;
        if (name === 'fillRect') draws.rects++;
        if (name === 'fillText') draws.texts++;
      };
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws, canvas };
}

const audioLog: string[] = [];
const audio: Audio = {
  unlock: async () => {}, play: (n) => { audioLog.push(n); }, music: () => {}, setEnabled: () => {}, suspend: () => {}, resume: () => {},
};
const haptics: string[] = [];
const platform = { isTelegram: false, haptic: (k: string) => { haptics.push(k); } } as unknown as Platform;
const deps: SessionDeps = { sprites, audio, platform, assets: REAL_ASSETS, maps: REAL_MAPS };

const VIEWPORTS = [
  { name: 'iPhone 17 Pro Max landscape', w: 956, h: 440, dpr: 3, safe: { l: 47, r: 47, t: 0, b: 21 } },
  { name: 'iPhone SE landscape', w: 667, h: 375, dpr: 2, safe: { l: 0, r: 0, t: 0, b: 0 } },
] as const;

const frame = (v: (typeof VIEWPORTS)[number], orders: boolean): FrameInfo => ({
  w: v.w, h: v.h, dpr: v.dpr, safe: v.safe, layout: computeLayout(v.w, v.h, v.safe, orders), held: new Set(), stick: { active: false, x: 0, y: 0 }, showControls: true,
});

describe('full pipeline on every map', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i))('map %i simulates and renders at both viewports without errors', (id) => {
    const opts = id < 7 ? { ...DM_OPTS, mapId: id } : { ...CTF_OPTS, mapId: id };
    const s = new GameSession(opts, 99 + id, deps);
    for (let t = 0; t < 400; t++) {
      s.tick(botInput(s.match, s.match.fighters[0]!));
      if (t % 100 === 0) {
        for (const v of VIEWPORTS) {
          const r = recorder();
          r.canvas.width = Math.round(v.w * v.dpr);
          r.canvas.height = Math.round(v.h * v.dpr);
          s.draw(r.ctx, frame(v, s.canOrderAlly), (t % 3) / 3);
          expect(r.draws.images, `${v.name} images`).toBeGreaterThan(20);
          expect(r.draws.texts).toBeGreaterThan(0);
        }
      }
    }
    expect(s.match.tick).toBe(400);
  });

  it('drawing restores the true simulation positions after interpolation', () => {
    const s = new GameSession({ ...DM_OPTS }, 5, deps);
    for (let t = 0; t < 30; t++) s.tick(botInput(s.match, s.match.fighters[0]!));
    const before = s.match.fighters.map((f) => [f.x, f.y]);
    const projBefore = s.match.projectiles.map((p) => p.x);
    const r = recorder();
    s.draw(r.ctx, frame(VIEWPORTS[0], false), 0.5);
    expect(s.match.fighters.map((f) => [f.x, f.y])).toEqual(before);
    expect(s.match.projectiles.map((p) => p.x)).toEqual(projBefore);
  });
});

describe('match lifecycle', () => {
  it('a Deathmatch with a frag limit ends with a winner', () => {
    const s = new GameSession({ ...DM_OPTS, mapId: 6, skill: 4, bots: 3, fragLimit: 5 }, 3, deps);
    for (let t = 0; t < 30000 && !s.result.over; t++) s.tick(botInput(s.match, s.match.fighters[0]!));
    expect(s.result.over).toBe(true);
    expect(s.result.winner).not.toBeNull();
    const top = Math.max(...s.match.score.slice(0, s.match.numSides));
    expect(top).toBeGreaterThanOrEqual(5);
  });

  it('plays sounds and haptics from engine events', () => {
    audioLog.length = 0;
    haptics.length = 0;
    const s = new GameSession({ ...DM_OPTS, skill: 4 }, 11, deps);
    for (let t = 0; t < 1500; t++) s.tick(botInput(s.match, s.match.fighters[0]!));
    expect(audioLog.length).toBeGreaterThan(5);
    expect(new Set(audioLog).size).toBeGreaterThan(2);
    expect(haptics.length).toBeGreaterThan(0);
  });

  it('an order to the ally gives immediate feedback: sound, haptic, toast and a highlighted order', () => {
    audioLog.length = 0;
    haptics.length = 0;
    const s = new GameSession({ ...CTF_OPTS }, 1, deps);
    expect(s.allyOrder).toBe(0);
    s.setAllyOrder(1);
    expect(s.allyOrder).toBe(1);
    expect(audioLog).toContain('pickup');
    expect(haptics).toContain('light');
    const r = recorder();
    r.canvas.width = 1912;
    r.canvas.height = 880;
    const texts: string[] = [];
    const ctx = new Proxy(r.ctx as object, { get: (t, n: string) => (n === 'fillText' ? (x: string) => { texts.push(x); } : n === 'measureText' ? (x: string) => ({ width: x.length * 7 }) : (t as Record<string, unknown>)[n]), set: () => true }) as unknown as CanvasRenderingContext2D;
    s.draw(ctx, frame(VIEWPORTS[0], true), 0);
    expect(texts).toContain('Ally: Take their flag!');
    for (let t = 0; t < 40; t++) s.tick(botInput(s.match, s.match.fighters[0]!));
    texts.length = 0;
    s.draw(ctx, frame(VIEWPORTS[0], true), 0);
    expect(texts).not.toContain('Ally: Take their flag!'); // the toast fades after about two seconds
  });

  it('the order toast is shown in the selected language', () => {
    setLang('ru');
    try {
      const s = new GameSession({ ...CTF_OPTS }, 1, deps);
      s.setAllyOrder(1);
      const r = recorder();
      r.canvas.width = 1912;
      r.canvas.height = 880;
      const texts: string[] = [];
      const ctx = new Proxy(r.ctx as object, { get: (t, n: string) => (n === 'fillText' ? (x: string) => { texts.push(x); } : n === 'measureText' ? (x: string) => ({ width: x.length * 7 }) : (t as Record<string, unknown>)[n]), set: () => true }) as unknown as CanvasRenderingContext2D;
      s.draw(ctx, frame(VIEWPORTS[0], true), 0);
      expect(texts).toContain('Союзник: Взять флаг!');
    } finally {
      setLang('en');
    }
  });

  it('orders are ignored (no toast, no sound) when there is no ally', () => {
    audioLog.length = 0;
    const s = new GameSession({ ...DM_OPTS }, 1, deps);
    s.setAllyOrder(1);
    expect(s.allyOrder).toBe(-1);
    expect(audioLog).not.toContain('pickup');
  });

  it('can order the ally only in a 2v2 CTF match', () => {
    const ctf = new GameSession({ ...CTF_OPTS }, 1, deps);
    expect(ctf.canOrderAlly).toBe(true);
    ctf.setAllyOrder(1);
    expect(ctf.match.fighters[1]!.aiOrder).toBe(1);
    expect(new GameSession({ ...DM_OPTS }, 1, deps).canOrderAlly).toBe(false);
    expect(new GameSession({ ...CTF_OPTS, team: false }, 1, deps).canOrderAlly).toBe(false);
  });
});
