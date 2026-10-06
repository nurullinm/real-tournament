import { describe, expect, it } from 'vitest';
import { loadCharsFromDisk } from '../../src/assets/disk';
import type { Sprites } from '../../src/assets/sprites';
import { createMatch } from '../../src/engine/match';
import { Effects } from '../../src/render/effects';
import { drawActors, drawFighter } from '../../src/render/fighters';
import { drawControls, drawHud, drawToast } from '../../src/render/hud';
import { newWorldAnim } from '../../src/render/world';
import { computeLayout } from '../../src/input/layout';
import { setLang } from '../../src/i18n';
import { CTF_OPTS, DM_OPTS, REAL_ASSETS, REAL_MAPS } from '../engine/real';

interface Call { name: string; args: unknown[] }

function mockCtx() {
  const calls: Call[] = [];
  let fontPx = 12;
  const ctx = new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => {
      calls.push({ name, args });
      // text width scales with the current font size, like a real canvas
      return name === 'measureText' ? { width: String(args[0]).length * fontPx * 0.66 } : undefined;
    },
    set: (_t, name: string, value: unknown) => {
      calls.push({ name: `set:${name}`, args: [value] });
      if (name === 'font') fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(String(value))?.[1] ?? fontPx);
      return true;
    },
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
    m.projectiles.push({ type: 56, x: 100, y: 100, v: 5, owner: 0, ownerNumber: 0, selfLiq: 300 });
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

describe('HUD in Russian', () => {
  it('shows weapon name, limit caption and order pills in Russian, and never English', () => {
    setLang('ru');
    try {
      const m = createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS);
      m.fighters[0]!.currentWeapon = 1;
      const hud = mockCtx();
      drawHud(hud.ctx, m, 0, vp, safe);
      const hudTexts = hud.calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
      expect(hudTexts.some((x) => x.startsWith('ЛАЗЕР'))).toBe(true);
      expect(hudTexts).toContain('ДО 3');
      expect(hudTexts.join(' ')).not.toMatch(/LASER|FIRST TO/);
      const ctl = mockCtx();
      drawControls(ctl.ctx, computeLayout(956, 440, safe, true), new Set(), { active: false, x: 0, y: 0 }, 2, 0);
      const pills = ctl.calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
      expect(pills).toEqual(expect.arrayContaining(['ЗАЩИТА', 'АТАКА', 'СВОБОДА']));
    } finally {
      setLang('en');
    }
  });
});

describe('order pills', () => {
  /** font in effect at each fillText of a pill label */
  function pillFonts(lang: 'en' | 'ru'): { sizes: number[]; labels: string[]; widths: number[] } {
    setLang(lang);
    try {
      const layout = computeLayout(956, 440, safe, true);
      const rec = mockCtx();
      drawControls(rec.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 2, 1);
      let font = 0;
      const sizes: number[] = []; const labels: string[] = [];
      for (const c of rec.calls) {
        if (c.name === 'set:font') font = Number(/(\d+)px/.exec(String(c.args[0]))?.[1] ?? 0);
        if (c.name === 'fillText' && ['DEFEND', 'ATTACK', 'FREE', 'ЗАЩИТА', 'АТАКА', 'СВОБОДА'].includes(String(c.args[0]))) { sizes.push(font); labels.push(String(c.args[0])); }
      }
      return { sizes, labels, widths: layout.buttons.filter((b) => b.shape === 'pill').map((b) => (b.shape === 'pill' ? b.w : 0)) };
    } finally {
      setLang('en');
    }
  }
  it.each(['en', 'ru'] as const)('%s: the three pills use the same font size and the same button size', (lang) => {
    const r = pillFonts(lang);
    expect(r.labels).toHaveLength(3);
    expect(new Set(r.sizes).size).toBe(1);
    expect(r.sizes[0]).toBeGreaterThan(6);
    expect(new Set(r.widths).size).toBe(1);
  });
});

describe('weapon swap button', () => {
  const layout = computeLayout(956, 440, safe, false);
  const swap = layout.buttons.find((b) => b.id === 'weaponNext')!;
  const draw = (weapon: number) => {
    const rec = mockCtx();
    drawControls(rec.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 2, -1, weapon);
    return rec.calls;
  };

  it('shows the current weapon inside a two-arrow cycle ring, not a pair of back-and-forth arrows', () => {
    if (swap.shape !== 'circle') throw new Error('swap must be round');
    for (const w of [0, 1, 2]) {
      const calls = draw(w);
      const ring = calls.filter((c) => c.name === 'arc' && c.args[0] === swap.cx && c.args[1] === swap.cy && Math.abs(Number(c.args[2]) - swap.r * 0.8) < 0.01);
      expect(ring, `weapon ${w}`).toHaveLength(2); // two arcs, each with its own arrow head
      expect(calls.some((c) => c.name === 'fillText' && /[⇄⇅↔]/.test(String(c.args[0])))).toBe(false);
    }
  });

  it('draws a different silhouette for the saw, the laser pistol and the bazooka', () => {
    const [a, b, c] = [0, 1, 2].map((w) => JSON.stringify(draw(w)));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('defaults to the laser pistol when no weapon is given', () => {
    const rec = mockCtx();
    drawControls(rec.ctx, layout, new Set(), { active: false, x: 0, y: 0 }, 2);
    expect(JSON.stringify(rec.calls)).toBe(JSON.stringify(draw(1)));
  });
});

describe('team frags in the HUD', () => {
  const ctf = () => createMatch(CTF_OPTS, REAL_MAPS[7]!, 1, REAL_ASSETS);
  const texts = (m: ReturnType<typeof ctf>, v = vp) => {
    const rec = mockCtx();
    drawHud(rec.ctx, m, 0, v, safe);
    return rec;
  };

  it('lists the player first, then the ally, with their personal frags (2v2 CTF)', () => {
    const m = ctf();
    m.fighters[0]!.frags = 3;
    m.fighters[1]!.frags = 1;
    m.fighters[2]!.frags = 9; // enemies are not shown
    const t = texts(m).calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
    expect(t).toContain('You 3');
    expect(t).toContain('Ally 1');
    expect(t.join(' ')).not.toContain('9');
    expect(t.indexOf('You 3')).toBeLessThan(t.indexOf('Ally 1'));
  });

  it('shows only the player in a solo CTF match', () => {
    const m = createMatch({ ...CTF_OPTS, team: false }, REAL_MAPS[7]!, 1, REAL_ASSETS);
    m.fighters[0]!.frags = 2;
    const t = texts(m).calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
    expect(t).toContain('You 2');
    expect(t.some((x) => x.startsWith('Ally'))).toBe(false);
  });

  it('does not add anything to the Deathmatch scoreboard (the score already is the frags)', () => {
    const m = createMatch(DM_OPTS, REAL_MAPS[0]!, 1, REAL_ASSETS);
    const t = texts(m).calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
    expect(t.some((x) => x.startsWith('You ') || x.startsWith('Ally'))).toBe(false);
  });

  it('is translated, and never runs into the health block: numbers only when the labelled pill would not fit', () => {
    setLang('ru');
    try {
      const m = ctf();
      m.fighters[0]!.frags = 12;
      m.fighters[1]!.frags = 7;
      // roomy screen: labelled
      const roomy = texts(m).calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
      expect(roomy).toContain('Вы 12');
      expect(roomy).toContain('Союзник 7');
      // narrow screen with big side insets: compact numbers
      const small = { w: 667, h: 375, dpr: 2 };
      const rec = texts(m, small);
      const t = rec.calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
      expect(t).toContain('12');
      expect(t).toContain('7');
      expect(t).not.toContain('Союзник 7');
      for (const v of [vp, small]) {
        const pill = texts(m, v).calls.find((c) => c.name === 'roundRect' && Number(c.args[3]) === 18)!;
        expect(Number(pill.args[0]), `${v.w}`).toBeGreaterThanOrEqual(safe.l + 12 + 170);
      }
    } finally {
      setLang('en');
    }
  });
});
