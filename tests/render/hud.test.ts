import { describe, expect, it } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import { createMatch } from '../../src/engine/match';
import { Effects } from '../../src/render/effects';
import { drawActors, drawFighter } from '../../src/render/fighters';
import { drawControls, drawHud, drawToast } from '../../src/render/hud';
import { newWorldAnim } from '../../src/render/world';
import { computeLayout } from '../../src/input/layout';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

interface Call { name: string; args: unknown[] }

function mockCtx() {
  const calls: Call[] = [];
  const ctx = new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => {
      calls.push({ name, args });
      return name === 'measureText' ? { width: String(args[0]).length * 7 } : undefined;
    },
    set: (_t, name: string, value: unknown) => { calls.push({ name: `set:${name}`, args: [value] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const img = {} as ImageBitmap;
const sprites = { tiles: img, energy: img, sheets: [img, img, img, img], chars: loadCharsFromDisk('public/original') } as unknown as Sprites;
const vp = { w: 956, h: 440, dpr: 3 };
const safe = { l: 47, r: 47, t: 0, b: 21 };

describe('HUD', () => {
  it('shows health, armor, ammo and the weapon name for the player', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    const p = m.fighters[0]!;
    p.hp = 73;
    p.armor = 40;
    p.currentWeapon = 1;
    p.ammo[1] = 25;
    const { ctx, calls } = mockCtx();
    drawHud(ctx, m, 0, vp, safe);
    const texts = calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
    expect(texts).toContain('73');
    expect(texts).toContain('40');
    expect(texts.some((t) => t.includes('LASER') && t.includes('25'))).toBe(true);
  });

  it('keeps every drawn element inside the safe area', () => {
    for (const mode of ['dm', 'ctf'] as const) {
      const m = mode === 'dm' ? createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS) : createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS);
      m.flagIsTaken = [true, true];
      const { ctx, calls } = mockCtx();
      drawHud(ctx, m, 0, vp, safe);
      for (const c of calls) {
        if (c.name === 'fillText') {
          expect(Number(c.args[1]), mode).toBeGreaterThanOrEqual(safe.l);
          expect(Number(c.args[1]), mode).toBeLessThanOrEqual(vp.w - safe.r);
          expect(Number(c.args[2])).toBeGreaterThanOrEqual(safe.t);
          expect(Number(c.args[2])).toBeLessThanOrEqual(vp.h - safe.b);
        }
        if (c.name === 'fillRect') {
          const [x, y, w, h] = c.args.map(Number) as [number, number, number, number];
          expect(x).toBeGreaterThanOrEqual(safe.l);
          expect(x + w).toBeLessThanOrEqual(vp.w - safe.r);
          expect(y).toBeGreaterThanOrEqual(safe.t);
          expect(y + h).toBeLessThanOrEqual(vp.h - safe.b);
        }
      }
    }
  });

  it('draws the frag limit in Deathmatch and flag scores in CTF', () => {
    const dm = mockCtx();
    drawHud(dm.ctx, createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS), 0, vp, safe);
    expect(dm.calls.some((c) => c.name === 'fillText' && String(c.args[0]).includes('FIRST TO 5'))).toBe(true);
    const ctf = mockCtx();
    drawHud(ctf.ctx, createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS), 0, vp, safe);
    expect(ctf.calls.some((c) => c.name === 'fillText' && String(c.args[0]).includes('FIRST TO 3'))).toBe(true);
  });
});

describe('controls', () => {
  it('draws every button and lights up pressed ones', () => {
    const layout = computeLayout(956, 440, safe, true);
    const idle = mockCtx();
    drawControls(idle.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 3);
    const arcs = idle.calls.filter((c) => c.name === 'arc').length;
    const pills = idle.calls.filter((c) => c.name === 'roundRect').length;
    const rounds = layout.buttons.filter((b) => b.shape === 'circle').length;
    expect(pills).toBe(layout.buttons.filter((b) => b.shape === 'pill').length);
    expect(arcs).toBeGreaterThanOrEqual(rounds + 3); // buttons + stick base, inner ring and knob
  });
  it('moves the knob with the stick and brightens it while held', () => {
    const layout = computeLayout(956, 440, safe, false);
    const a = mockCtx();
    drawControls(a.ctx, layout, new Set(), { active: true, x: 30, y: -10 }, 2);
    const knob = a.calls.filter((c) => c.name === 'arc').find((c) => c.args[0] === layout.stick.cx + 30 && c.args[1] === layout.stick.cy - 10);
    expect(knob).toBeDefined();
  });
});

describe('actors and effects', () => {
  it('draws fighters with sprites and a health bar', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    const { ctx, calls } = mockCtx();
    drawFighter(ctx, m.fighters[0]!, 0, sprites, newWorldAnim());
    const draws = calls.filter((c) => c.name === 'drawImage');
    expect(draws.length).toBeGreaterThan(1); // body parts + energy bar
    const bar = draws.find((c) => c.args[0] === img && c.args.length === 9 && c.args[8] === 3)!;
    expect(bar.args[3]).toBe(20); // 100 hp = 5 segments * 4 px
  });
  it('skips fighters that are dead and finished animating', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    const f = m.fighters[1]!;
    f.hp = 0;
    f.busyIndex = 0;
    const { ctx, calls } = mockCtx();
    drawFighter(ctx, f, 0, sprites, newWorldAnim());
    expect(calls).toHaveLength(0);
  });
  it('draws rockets mirrored by direction', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    m.projectiles.push({ type: 56, x: 100, y: 100, v: 5, owner: 0, selfLiq: 300 });
    const { ctx, calls } = mockCtx();
    drawActors(ctx, { ...m, numFighters: 0 } as typeof m, sprites, newWorldAnim());
    expect(calls.some((c) => c.name === 'drawImage')).toBe(true);
  });
  it('effects play and expire, with the cap of 30 sprites', () => {
    const fx = new Effects();
    fx.spawn([{ kind: 'fx', seq: 'explosion', x: 1, y: 2 }], 0);
    expect(fx.count).toBe(1);
    for (let i = 0; i < 10; i++) fx.advance();
    expect(fx.count).toBe(0);
    fx.spawn(Array.from({ length: 50 }, () => ({ kind: 'fx' as const, seq: 'smoke', x: 0, y: 0 })), 0);
    expect(fx.count).toBe(30);
  });
});

describe('lift riders in the actor pass', () => {
  it('are skipped (they are drawn with their car) while tram passengers are drawn normally', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    for (const f of m.fighters) f.hp = 0; // nobody draws
    m.fighters[0]!.hp = 100;
    m.fighters[0]!.isPassenger = true;
    m.fighters[0]!.liftcar = 1;
    const lift = mockCtx();
    drawActors(lift.ctx, m, sprites, newWorldAnim());
    expect(lift.calls.filter((c) => c.name === 'drawImage')).toHaveLength(0);
    m.fighters[0]!.liftcar = -1; // on the tram
    const tram = mockCtx();
    drawActors(tram.ctx, m, sprites, newWorldAnim());
    expect(tram.calls.filter((c) => c.name === 'drawImage').length).toBeGreaterThan(0);
  });
});

describe('order feedback', () => {
  const ACTIVE = 'rgba(255,163,26,0.6)';
  it('highlights only the chosen order pill', () => {
    const layout = computeLayout(956, 440, safe, true);
    const none = mockCtx();
    drawControls(none.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 2);
    expect(none.calls.filter((c) => c.name === 'set:fillStyle' && c.args[0] === ACTIVE)).toHaveLength(0);
    const second = mockCtx();
    drawControls(second.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 2, 1);
    expect(second.calls.filter((c) => c.name === 'set:fillStyle' && c.args[0] === ACTIVE)).toHaveLength(1);
  });
  it('draws a toast inside the screen', () => {
    const t = mockCtx();
    drawToast(t.ctx, 'Ally: Defend the base', vp, safe, 74);
    expect(t.calls.some((c) => c.name === 'fillText' && c.args[0] === 'Ally: Defend the base')).toBe(true);
  });
});
