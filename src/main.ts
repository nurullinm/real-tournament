import './ui/style.css';
import { parsePassability, loadAllMaps } from './assets/maps';
import { parseStrings } from './assets/strings';
import { loadSprites } from './assets/sprites';
import { createAudio } from './audio/audio';
import { computeMuzzle } from './engine/muzzle';
import type { EngineAssets } from './engine/types';
import { GameSession, TICK_HZ, type FrameInfo } from './game/session';
import { createLoop } from './game/loop';
import { computeLayout, type Insets } from './input/layout';
import { createKeyboardInput, mergeInputs } from './input/keyboard';
import { createTouchInput } from './input/touch';
import { initPlatform } from './platform/telegram';
import { createUi } from './ui/screens';
import { loadSettings, saveSettings, toMatchOptions } from './ui/settings';

/** Reads the device safe area (notch, home indicator) from CSS env() through a probe element. */
function cssSafeArea(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const out = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function boot(): Promise<void> {
  const platform = await initPlatform();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const [sprites, maps, pass, helpBytes] = await Promise.all([loadSprites(), loadAllMaps(), bytes('original/pass'), bytes('original/help.str')]);
  const assets: EngineAssets = { passable: parsePassability(pass), ...computeMuzzle(sprites.chars) };
  const helpStrings = parseStrings(helpBytes);
  const settings = loadSettings();
  const audio = createAudio();
  audio.setEnabled(settings.sound);

  let session: GameSession | null = null;
  let orientationLocked = false;
  let safe: Insets = { l: 0, r: 0, t: 0, b: 0 };
  let css = { w: 0, h: 0, dpr: 1 };
  let layout = computeLayout(1, 1, safe);
  const touch = createTouchInput(canvas, layout, { onOrder: (o) => session?.setAllyOrder(o) });
  const keyboard = createKeyboardInput(window);

  const resize = (): void => {
    const p = platform.safeArea();
    const c = cssSafeArea();
    safe = { l: Math.max(p.l, c.l), r: Math.max(p.r, c.r), t: Math.max(p.t, c.t), b: Math.max(p.b, c.b) };
    const root = document.documentElement.style;
    root.setProperty('--safe-l', `${safe.l}px`);
    root.setProperty('--safe-r', `${safe.r}px`);
    root.setProperty('--safe-t', `${safe.t}px`);
    root.setProperty('--safe-b', `${safe.b}px`);
    css = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 };
    canvas.width = Math.round(css.w * css.dpr);
    canvas.height = Math.round(css.h * css.dpr);
    layout = computeLayout(css.w, css.h, safe, !!session?.canOrderAlly);
    touch.setLayout(layout);
    const blocked = !platform.isLandscape();
    if (!blocked && !orientationLocked) void platform.lockLandscape().then((ok) => { orientationLocked = ok; });
    ui.setRotateOverlay(blocked);
    if (blocked) suspendPlay();
    else resumePlay();
  };

  const frameInfo = (): FrameInfo => ({ ...css, safe, layout, held: touch.held(), showControls: true });

  const tickOnce = (): void => {
    if (!session) return;
    session.tick(mergeInputs(touch.state(), keyboard.state()));
    if (session.result.over) finishMatch();
  };
  const renderFrame = (alpha: number): void => {
    if (session) session.draw(ctx, frameInfo(), alpha);
    else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };
  const loop = createLoop(tickOnce, renderFrame, TICK_HZ);

  /** Pauses for reasons outside the player's control (background, portrait); resumes on its own when they clear. */
  let autoPaused = false;
  /** false while Telegram reports the mini app as deactivated (collapsed); resize events must not restart play then */
  let tgActive = true;
  function suspendPlay(): void {
    if (session && loop.running) {
      loop.pause();
      touch.releaseAll();
      keyboard.releaseAll();
      autoPaused = true;
    }
    audio.suspend();
  }
  function resumePlay(): void {
    if (autoPaused && session && !ui.open && platform.isLandscape() && !document.hidden && tgActive) {
      autoPaused = false;
      loop.resume();
    }
    if (!document.hidden && platform.isLandscape() && tgActive) audio.resume();
  }

  function pauseMenu(): void {
    if (!session) return;
    loop.pause();
    touch.releaseAll();
    keyboard.releaseAll();
    ui.showPause(session.canOrderAlly, session.match.fighters[1]?.aiOrder ?? 0);
  }
  function finishMatch(): void {
    if (!session) return;
    loop.pause();
    touch.releaseAll();
    ui.setPauseButton(false);
    ui.showResult(session.match);
  }
  function toMenu(): void {
    session = null;
    autoPaused = false;
    loop.pause();
    ui.setPauseButton(false);
    ui.showMain(false);
    audio.music(settings.sound);
    resize();
  }
  function start(mode: 'dm' | 'ctf'): void {
    saveSettings(settings);
    session = new GameSession(toMatchOptions(settings, mode), (Date.now() ^ (performance.now() * 1000)) >>> 0, { sprites, audio, platform, assets, maps });
    audio.music(false);
    ui.hide();
    ui.setPauseButton(true);
    resize();
    loop.start();
  }

  const ui = createUi(document.getElementById('ui')!, settings, {
    controls: 'Use the arrows at the bottom left to move. Press jump to jump (hold it for a higher jump) and fire to shoot the current weapon.\n\nChange weapons with the ‹ › buttons.\n\nPress the action button next to an elevator button to call it, or at a cycle dock to get on a cycle.\n\nOn a computer: arrows or WASD, Space to fire, Q/E or 1-3 to change weapons.',
    pickups: helpStrings[5] ?? '',
    deathmatch: helpStrings[6] ?? '',
    ctf: (helpStrings[7] ?? '').replace('To command your ally, press SOFT1.', 'To command your ally, use the order buttons on the screen or the pause menu.'),
  }, {
    start,
    continueGame: () => { ui.hide(); loop.resume(); },
    resume: () => { ui.hide(); loop.resume(); },
    pause: pauseMenu,
    endGame: toMenu,
    settingsChanged: (s) => { saveSettings(s); audio.setEnabled(s.sound); if (!session) audio.music(s.sound); },
    allyOrder: (o) => session?.setAllyOrder(o),
  });

  window.addEventListener('pointerdown', () => { void audio.unlock().then(() => { if (!session) audio.music(settings.sound); }); void platform.lockLandscape(); }, { once: true });
  platform.onResize(resize);
  platform.onVisibility((visible) => {
    tgActive = visible;
    if (visible) resumePlay();
    else suspendPlay();
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && session && loop.running) pauseMenu(); });
  window.addEventListener('keydown', () => { void audio.unlock(); }, { once: true });

  if (import.meta.env.DEV) (window as unknown as { __rt: unknown }).__rt = { get session() { return session; }, loop, ui, settings, tickOnce, renderFrame };
  const auto = new URLSearchParams(location.search).get('autostart');
  resize();
  if (auto === 'dm' || auto === 'ctf') {
    const map = Number(new URLSearchParams(location.search).get('map'));
    if (Number.isInteger(map) && map >= 0) {
      if (auto === 'dm') settings.dm.map = Math.min(map, 6);
      else settings.ctf.map = Math.min(map, 4);
    }
    start(auto);
  }
  else ui.showMain(false);
}

boot().catch((err) => {
  const el = document.createElement('pre');
  el.style.cssText = 'color:#fff;padding:16px;white-space:pre-wrap';
  el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(el);
});
