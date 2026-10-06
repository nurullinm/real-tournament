import type { Sprites } from '../assets/sprites';
import type { GameMap } from '../assets/types';
import type { Audio, SoundName } from '../audio/audio';
import { eventVolume } from '../audio/spatial';
import { botHooks, setAllyOrder, type AllyOrder } from '../bots';
import type { NetTick } from '../net/lockstep';
import { createMatch, matchResult, skinFor, step, type MatchResult } from '../engine/match';
import type { EngineAssets, InputState, Match, MatchOptions } from '../engine/types';
import type { ButtonLayout, ButtonId, Insets } from '../input/layout';
import type { StickState } from '../input/touch';
import { orderLabel, t } from '../i18n';
import type { Platform } from '../platform/telegram';
import { cameraTarget, computeCamera, followCamera, type Point } from '../render/camera';
import { Effects } from '../render/effects';
import { drawActors, drawFighter } from '../render/fighters';
import { drawControls, drawHud, drawToast } from '../render/hud';
import { computeScale } from '../render/scale';
import { advanceWorldAnim, beginWorld, drawTram, drawWorld, newWorldAnim, TILE } from '../render/world';

export const TICK_HZ = 1000 / 60;
const TARGET_TILES_H = 14;
const CAMERA_STEP_X = 6;
const CAMERA_STEP_Y = 9;
const TOAST_TICKS = 36;

export interface SessionDeps {
  sprites: Sprites;
  audio: Audio;
  platform: Platform;
  assets: EngineAssets;
  maps: GameMap[];
}

export interface FrameInfo {
  /** CSS pixels */
  w: number;
  h: number;
  dpr: number;
  safe: Insets;
  layout: ButtonLayout;
  held: ReadonlySet<ButtonId>;
  stick: StickState;
  showControls: boolean;
}

/** One running match: engine state plus everything that only exists for presentation (camera, effects, interpolation). */
export class GameSession {
  readonly match: Match;
  result: MatchResult = { over: false, winner: null };
  private readonly effects = new Effects();
  private readonly anim = newWorldAnim();
  private prev: { x: number; y: number }[] = [];
  private prevProj = new Map<object, number>();
  /** previous-tick y of lift cars (pobj index -> y), so riders and their car are interpolated together */
  private prevCarY = new Map<number, number>();
  private prevTramX = 0;
  private cam: Point = { x: 0, y: 0 };
  private prevCam: Point = { x: 0, y: 0 };
  private view = { w: 176, h: 192 };
  private lastHp = 100;
  private toast: { text: string; ticks: number } | null = null;

  /** `localSlot`: which fighter this device controls; `names`: player nicknames by slot (online matches only) */
  constructor(opts: MatchOptions, seed: number, private readonly deps: SessionDeps, readonly localSlot = 0, readonly names: string[] = []) {
    this.match = createMatch(opts, deps.maps[opts.mapId]!, seed, deps.assets, botHooks);
    this.snapPrev();
    const p = this.match.fighters[localSlot]!;
    this.cam = this.prevCam = computeCamera(cameraTarget(p, p.headsLeft, this.view), this.view, { w: this.match.mapWidth, h: this.match.mapHeight });
    this.lastHp = p.hp;
  }

  private snapPrev(): void {
    this.prev = this.match.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj.clear();
    for (const p of this.match.projectiles) this.prevProj.set(p, p.x);
    this.prevTramX = this.match.tram.x;
    this.prevCarY.clear();
    this.match.pobjs.forEach((p, i) => { if (p.type === 1 || p.type === 18 || p.type === 19) this.prevCarY.set(i, p.y); });
  }

  /** One 60 ms engine tick with the player's input. */
  tick(input: InputState): void {
    this.advance(new Map([[this.localSlot, input]]));
  }

  /** One server-issued tick of an online match: everybody's input, plus humans who left (bots take over). */
  tickNet(nt: NetTick): void {
    const m = this.match;
    for (const slot of nt.dropped) {
      const f = m.fighters[slot];
      if (f && f.human) {
        f.human = false;
        f.skin = skinFor(m, f);
        m.ai.findNearestNode(m, f);
      }
    }
    this.advance(nt.inputs);
  }

  private advance(inputs: Map<number, InputState>): void {
    const m = this.match;
    this.snapPrev();
    step(m, inputs);
    advanceWorldAnim(this.anim, m.tick);
    this.effects.advance();
    this.effects.spawn(m.events, m.tick);
    const me = m.fighters[this.localSlot]!;
    for (const e of m.events) {
      if (e.kind === 'sound' && (e.by === undefined || e.by === this.localSlot)) this.deps.audio.play(e.name as SoundName, eventVolume(me.x, me.y, e.x, e.y));
    }
    if (me.hp < this.lastHp) this.deps.platform.haptic(me.hp <= 0 ? 'medium' : 'light');
    this.lastHp = me.hp;
    if (this.toast && --this.toast.ticks <= 0) this.toast = null;
    this.updateCamera();
    this.result = matchResult(m);
  }

  private updateCamera(): void {
    const m = this.match;
    const p = m.fighters[this.localSlot]!;
    const target = cameraTarget(p, p.headsLeft, this.view);
    this.prevCam = this.cam;
    const far = Math.abs(target.x - this.cam.x) > this.view.w || Math.abs(target.y - this.cam.y) > this.view.h;
    const next = far ? target : followCamera(this.cam, target, CAMERA_STEP_X, CAMERA_STEP_Y);
    this.cam = computeCamera(next, this.view, { w: m.mapWidth, h: m.mapHeight });
    if (far) this.prevCam = this.cam;
  }

  /** Nicknames above the other players' heads (online matches). */
  private drawNames(ctx: CanvasRenderingContext2D): void {
    if (this.names.length === 0) return;
    ctx.font = '700 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    this.names.forEach((name, slot) => {
      const f = this.match.fighters[slot];
      if (!f || slot === this.localSlot || f.hp <= 0) return;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(name, f.x, f.y - 38);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, f.x, f.y - 38);
    });
  }

  setAllyOrder(order: AllyOrder): void {
    if (!this.canOrderAlly) return;
    setAllyOrder(this.match, order);
    // the ally changes route at his next waypoint, so confirm the order right away
    this.toast = { text: t('toast.ally', { order: orderLabel(order) }), ticks: TOAST_TICKS };
    this.deps.platform.haptic('light');
    this.deps.audio.play('order');
  }

  /** current order of the ally (fighter 1), or -1 when there is no ally */
  get allyOrder(): number {
    return this.canOrderAlly ? this.match.fighters[1]!.aiOrder : -1;
  }

  get canOrderAlly(): boolean {
    return this.match.gameMode === 1 && this.match.numFighters >= 4;
  }

  /** Renders the current state; `alpha` interpolates between the previous and current tick. */
  draw(ctx: CanvasRenderingContext2D, f: FrameInfo, alpha: number): void {
    const m = this.match;
    const si = computeScale(f.w, f.h, f.dpr, TILE, TARGET_TILES_H);
    this.view = { w: si.viewW, h: si.viewH };
    const cam = computeCamera(
      { x: Math.round(this.prevCam.x + (this.cam.x - this.prevCam.x) * alpha), y: Math.round(this.prevCam.y + (this.cam.y - this.prevCam.y) * alpha) },
      this.view,
      { w: m.mapWidth, h: m.mapHeight },
    );
    beginWorld(ctx, cam, si.scale);
    // interpolate movers for smooth 60 fps on a 16.7 Hz simulation (teleports and respawns are not smoothed);
    // cars and the tram move up to 14 px per tick, so they are interpolated exactly like their passengers
    const carSaved: [number, number][] = [];
    this.prevCarY.forEach((py, i) => {
      const car = m.pobjs[i]!;
      carSaved.push([i, car.y]);
      if (Math.abs(car.y - py) <= 24) car.y = Math.round(py + (car.y - py) * alpha);
    });
    const tramSaved = m.tram.x;
    if (Math.abs(m.tram.x - this.prevTramX) <= 24) m.tram.x = Math.round(this.prevTramX + (m.tram.x - this.prevTramX) * alpha);
    const saved = m.fighters.map((x) => ({ x: x.x, y: x.y }));
    m.fighters.forEach((fi, i) => {
      const p = this.prev[i];
      if (!p || Math.abs(fi.x - p.x) > 24 || Math.abs(fi.y - p.y) > 24) return;
      fi.x = Math.round(p.x + (fi.x - p.x) * alpha);
      fi.y = Math.round(p.y + (fi.y - p.y) * alpha);
    });
    const savedProj = m.projectiles.map((p) => p.x);
    m.projectiles.forEach((p) => {
      const px = this.prevProj.get(p);
      if (px !== undefined) p.x = Math.round(px + (p.x - px) * alpha);
    });
    try {
      const { sprites } = this.deps;
      drawWorld(ctx, m, cam, this.view, sprites, this.anim, (rider) => drawFighter(ctx, rider, m.tick, sprites, this.anim));
      drawActors(ctx, m, sprites, this.anim);
      this.effects.draw(ctx, sprites);
      drawTram(ctx, m, this.view, cam, sprites);
      this.drawNames(ctx);
    } finally {
      m.fighters.forEach((fi, i) => { fi.x = saved[i]!.x; fi.y = saved[i]!.y; });
      carSaved.forEach(([i, y]) => { m.pobjs[i]!.y = y; });
      m.tram.x = tramSaved;
      m.projectiles.forEach((p, i) => { p.x = savedProj[i]!; });
    }
    drawHud(ctx, m, this.localSlot, { w: f.w, h: f.h, dpr: f.dpr }, f.safe);
    if (this.toast) drawToast(ctx, this.toast.text, { w: f.w, h: f.h, dpr: f.dpr }, f.safe, f.safe.t + 74);
    if (f.showControls) drawControls(ctx, f.layout, f.held, f.stick, f.dpr, this.allyOrder, m.fighters[this.localSlot]!.currentWeapon);
  }
}
