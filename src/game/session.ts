import type { Sprites } from '../assets/sprites';
import type { GameMap } from '../assets/types';
import type { Audio, SoundName } from '../audio/audio';
import { eventVolume } from '../audio/spatial';
import { botHooks, setAllyOrder, type AllyOrder } from '../bots';
import { createMatch, matchResult, step, type MatchResult } from '../engine/match';
import type { EngineAssets, InputState, Match, MatchOptions } from '../engine/types';
import type { ButtonLayout, ButtonId, Insets } from '../input/layout';
import type { Platform } from '../platform/telegram';
import { cameraTarget, computeCamera, followCamera, type Point } from '../render/camera';
import { Effects } from '../render/effects';
import { drawActors } from '../render/fighters';
import { drawControls, drawHud } from '../render/hud';
import { computeScale } from '../render/scale';
import { advanceWorldAnim, beginWorld, drawWorld, newWorldAnim, TILE } from '../render/world';

export const TICK_HZ = 1000 / 60;
const TARGET_TILES_H = 14;
const CAMERA_STEP_X = 6;
const CAMERA_STEP_Y = 9;

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
  private cam: Point = { x: 0, y: 0 };
  private prevCam: Point = { x: 0, y: 0 };
  private view = { w: 176, h: 192 };
  private lastHp = 100;

  constructor(opts: MatchOptions, seed: number, private readonly deps: SessionDeps) {
    this.match = createMatch(opts, deps.maps[opts.mapId]!, seed, deps.assets, botHooks);
    this.snapPrev();
    const p = this.match.fighters[0]!;
    this.cam = this.prevCam = computeCamera(cameraTarget(p, p.headsLeft, this.view), this.view, { w: this.match.mapWidth, h: this.match.mapHeight });
    this.lastHp = p.hp;
  }

  private snapPrev(): void {
    this.prev = this.match.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj.clear();
    for (const p of this.match.projectiles) this.prevProj.set(p, p.x);
  }

  /** One 60 ms engine tick with the player's input. */
  tick(input: InputState): void {
    const m = this.match;
    this.snapPrev();
    step(m, new Map([[0, input]]));
    advanceWorldAnim(this.anim, m.tick);
    this.effects.advance();
    this.effects.spawn(m.events, m.tick);
    const me = m.fighters[0]!;
    for (const e of m.events) {
      if (e.kind === 'sound') this.deps.audio.play(e.name as SoundName, eventVolume(me.x, me.y, e.x, e.y));
    }
    if (me.hp < this.lastHp) this.deps.platform.haptic(me.hp <= 0 ? 'medium' : 'light');
    this.lastHp = me.hp;
    this.updateCamera();
    this.result = matchResult(m);
  }

  private updateCamera(): void {
    const m = this.match;
    const p = m.fighters[0]!;
    const target = cameraTarget(p, p.headsLeft, this.view);
    this.prevCam = this.cam;
    const far = Math.abs(target.x - this.cam.x) > this.view.w || Math.abs(target.y - this.cam.y) > this.view.h;
    const next = far ? target : followCamera(this.cam, target, CAMERA_STEP_X, CAMERA_STEP_Y);
    this.cam = computeCamera(next, this.view, { w: m.mapWidth, h: m.mapHeight });
    if (far) this.prevCam = this.cam;
  }

  setAllyOrder(order: AllyOrder): void {
    setAllyOrder(this.match, order);
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
    drawWorld(ctx, m, cam, this.view, this.deps.sprites, this.anim);
    this.effects.draw(ctx, this.deps.sprites);
    // interpolate movers for smooth 60 fps on a 16.7 Hz simulation (teleports and respawns are not smoothed)
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
    drawActors(ctx, m, this.deps.sprites, this.anim);
    m.fighters.forEach((fi, i) => { fi.x = saved[i]!.x; fi.y = saved[i]!.y; });
    m.projectiles.forEach((p, i) => { p.x = savedProj[i]!; });
    drawHud(ctx, m, 0, { w: f.w, h: f.h, dpr: f.dpr }, f.safe);
    if (f.showControls) drawControls(ctx, f.layout, f.held, f.dpr);
  }
}
