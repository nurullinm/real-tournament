import './ui/style.css';
import { parsePassability, loadAllMaps } from './assets/maps';
import { loadSprites } from './assets/sprites';
import { createAudio, musicForMap } from './audio/audio';
import { computeMuzzle } from './engine/muzzle';
import type { EngineAssets } from './engine/types';
import { GameSession, TICK_HZ, type FrameInfo } from './game/session';
import { scoreboard } from './game/stats';
import { createLoop } from './game/loop';
import { computeLayout, type Insets } from './input/layout';
import { createKeyboardInput, mergeInputs } from './input/keyboard';
import { createTouchInput } from './input/touch';
import { inputToCmd } from './engine/match';
import { connectRoom, type NetClient } from './net/client';
import { TickClock } from './net/clock';
import { Lockstep } from './net/lockstep';
import { cleanName, randomCode, type RoomConfig } from './net/protocol';
import type { LobbyView } from './ui/screens';
import { getLang, onLangChange, resolveLang, setLang, t } from './i18n';
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

/** Events that count as a user gesture on iOS/Android/desktop; the first one that works unlocks sound. */
const GESTURES = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'] as const;

async function boot(): Promise<void> {
  // Sound is set up before anything is downloaded: a tap during loading must not be lost, and webviews that
  // allow autoplay start the menu music immediately.
  const settings = loadSettings();
  const audio = createAudio();
  audio.setEnabled(settings.sound);
  audio.playMusic('menu');
  audio.init();
  // These listeners stay for the whole session: after a screen lock or a call the OS interrupts audio again,
  // and the next touch must be able to revive it (unlock() is a no-op while sound is already running).
  const unlockAudio = (): void => { void audio.unlock(); };
  for (const g of GESTURES) window.addEventListener(g, unlockAudio, { capture: true, passive: true });
  // gesture-free recovery attempts: coming back to the app, regaining focus, and a slow watchdog
  const poke = (): void => audio.poke();
  window.addEventListener('focus', poke);
  window.addEventListener('pageshow', poke);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });
  setInterval(poke, 2000);
  if (new URLSearchParams(location.search).has('debug')) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99999;margin:0;padding:4px 6px;font:10px/1.3 monospace;color:#0f0;background:rgba(0,0,0,.7);pointer-events:none;max-width:60vw;white-space:pre-wrap';
    document.body.appendChild(box);
    const log: string[] = [];
    const note = (e: string): void => { log.push(`${new Date().toISOString().slice(14, 19)} ${e}`); if (log.length > 8) log.shift(); };
    for (const ev of ['visibilitychange', 'pageshow', 'pagehide', 'focus', 'blur', 'touchend']) window.addEventListener(ev, () => note(ev + (ev === 'visibilitychange' ? ':' + document.visibilityState : '')), true);
    setInterval(() => { box.textContent = audio.debug() + '\n' + log.join('\n'); }, 400);
  }

  const platform = await initPlatform();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const [sprites, maps, pass] = await Promise.all([loadSprites(), loadAllMaps(), bytes('original/pass')]);
  const assets: EngineAssets = { passable: parsePassability(pass), ...computeMuzzle(sprites.chars) };
  const applyLanguage = (): void => setLang(resolveLang(settings.language, platform.languageHints()));
  onLangChange(() => {
    document.documentElement.lang = getLang();
    document.title = t('app.title');
  });
  applyLanguage();
  document.documentElement.lang = getLang();

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

  const frameInfo = (): FrameInfo => ({ ...css, safe, layout, held: touch.held(), stick: touch.stick(), showControls: true });

  // ---- online play (lockstep over a Cloudflare room) ----
  let net: NetClient | null = null;
  let lockstep: Lockstep | null = null;
  let online = false;
  let mySlot = 0;
  let roomCode = '';
  let lobbyView: LobbyView | null = null;
  const clock = new TickClock();
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let lastCmd = 0;
  const tgInitData = (): string => (globalThis as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? '';
  const tgName = (): string => (globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? '';
  const myName = (): string => cleanName(settings.nickname || tgName(), 'Player');

  function leaveRoom(): void {
    net?.close();
    net = null;
    ui.showCountdown(null);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    lockstep = null;
    online = false;
    lobbyView = null;
  }
  function openRoom(code: string, create: boolean): void {
    leaveRoom();
    roomCode = code;
    saveSettings(settings);
    ui.showConnecting();
    net = connectRoom(code, { t: 'hello', name: myName(), initData: tgInitData(), create }, {
      message: (m) => {
        switch (m.t) {
          case 'welcome': mySlot = m.slot; break;
          case 'lobby':
            lobbyView = { code: roomCode, players: m.players, cfg: m.cfg, slot: mySlot, host: m.players.some((p) => p.slot === mySlot && p.host) };
            if (!session) ui.showLobby(lobbyView);
            break;
          case 'countdown': ui.showCountdown(m.n); audio.play('order'); break;
          case 'start': ui.showCountdown(null); startOnline(m); break;
          case 'tick': lockstep?.push(m.n, m.i, m.d); clock.onTick(m.n, performance.now()); break;
          case 'pong': clock.onPong(m.ts, performance.now()); break;
          case 'error': leaveRoom(); ui.showMultiplayer(t(`mp.err.${m.reason}`)); break;
        }
      },
      closed: () => {
        if (!net) return;
        const inMatch = online && session && !session.result.over;
        leaveRoom();
        if (inMatch) toMenu();
        ui.showMultiplayer(t('mp.err.net'));
      },
    });
  }
  function startOnline(m: { seed: number; cfg: RoomConfig; humanSlots: number[]; names: string[]; colors: number[]; slot: number }): void {
    const common = { skill: m.cfg.skill, noMedikits: m.cfg.noMedikits, violence: settings.violence, humanSlots: m.humanSlots };
    const opts = m.cfg.mode === 'ctf'
      // CTF is always 2v2: team 0 (blue) is fighters 0-1, team 1 (red) fighters 2-3, bots take the empty places
      ? { ...common, mapId: 7 + m.cfg.mapId, mode: 'ctf' as const, bots: 0, fragLimit: m.cfg.fragLimit, team: true, playerColor: 0 }
      : { ...common, mapId: m.cfg.mapId, mode: 'dm' as const, bots: m.humanSlots.length + m.cfg.bots - 1, fragLimit: m.cfg.fragLimit, team: false, playerColor: m.colors[0] ?? 0, humanColors: m.humanSlots.map((s) => m.colors[s] ?? 0) };
    mySlot = m.slot;
    lockstep = new Lockstep(m.humanSlots);
    online = true;
    lastCmd = 0;
    lastTickAt = performance.now();
    pingTimer = setInterval(() => net?.send({ t: 'ping', ts: performance.now() }), 1000);
    net?.send({ t: 'ping', ts: performance.now() });
    session = new GameSession(opts, m.seed, { sprites, audio, platform, assets, maps }, m.slot, m.names);
    audio.playMusic(musicForMap(opts.mapId));
    ui.hide();
    ui.setPauseButton(true);
    resize();
    loop.start();
  }
  /**
   * Samples the input, hands it to the prediction and sends it to the room when it changes (held buttons) or carries a
   * one-shot weapon pulse. The input is stamped with the tick it first applies to, so the server uses it at that same tick.
   */
  function sendInput(): void {
    if (!session) return;
    const input = mergeInputs(touch.state(), keyboard.state());
    const c = inputToCmd(input);
    const at = session.nextTick;
    session.setLocalInput(input);
    if (c !== lastCmd || input.weaponSelect !== -1 || input.weaponDelta !== 0) {
      lastCmd = c;
      net?.send({ t: 'in', c, ws: input.weaponSelect, wd: input.weaponDelta, at });
    }
  }

  /**
   * Online play runs off the network, not the local 60 ms clock: input is sampled and sent every frame (not once per
   * tick), and a server tick is simulated the moment it has arrived. That removes two waits of up to a tick each.
   */
  let lastTickAt = 0;
  const pumpNet = (): void => {
    if (!session || !lockstep || !online) return;
    sendInput();
    // confirmed ticks from the server (after a stall, catch up faster than real time)
    const n = lockstep.backlog > 4 ? Math.min(lockstep.backlog - 2, 12) : lockstep.backlog;
    for (let i = 0; i < n; i++) {
      const nt = lockstep.pull();
      if (!nt) break;
      session.tickNet(nt);
      if (session.result.over) { net?.send({ t: 'over' }); finishMatch(); return; }
    }
    // client-side prediction: run the local simulation ahead of the server with the player's own input
    const before = session.match.tick;
    session.predictTo(clock.target(performance.now()));
    if (session.match.tick !== before) lastTickAt = performance.now();
  };

  const tickOnce = (): void => {
    if (!session || online) return; // online ticks come from pumpNet
    session.tick(mergeInputs(touch.state(), keyboard.state()));
    if (session.result.over) finishMatch();
  };
  const renderFrame = (localAlpha: number): void => {
    let alpha = localAlpha;
    if (online) {
      pumpNet();
      alpha = Math.min(1, (performance.now() - lastTickAt) / (1000 / 16.667));
    }
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
      if (online) { lastCmd = 0; net?.send({ t: 'in', c: 0, ws: -1, wd: 0 }); } // don't keep running/firing while away
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
    // an online match runs on: the menu opens over the live game
    if (!online) loop.pause();
    touch.releaseAll();
    keyboard.releaseAll();
    ui.showPause(session.canOrderAlly, session.match.fighters[1]?.aiOrder ?? 0, scoreboard(session.authoritative, session.localSlot, session.names));
  }
  function finishMatch(): void {
    if (!session) return;
    loop.pause();
    touch.releaseAll();
    ui.setPauseButton(false);
    ui.showResult(session.authoritative, online ? { names: session.names, slot: session.localSlot } : undefined);
    if (online) leaveRoom();
  }
  function toMenu(): void {
    leaveRoom();
    session = null;
    autoPaused = false;
    loop.pause();
    ui.setPauseButton(false);
    ui.showMain(false);
    audio.playMusic(settings.sound ? 'menu' : null);
    resize();
  }
  function start(mode: 'dm' | 'ctf'): void {
    saveSettings(settings);
    session = new GameSession(toMatchOptions(settings, mode), (Date.now() ^ (performance.now() * 1000)) >>> 0, { sprites, audio, platform, assets, maps });
    audio.playMusic(musicForMap(toMatchOptions(settings, mode).mapId));
    ui.hide();
    ui.setPauseButton(true);
    resize();
    loop.start();
  }

  const ui = createUi(document.getElementById('ui')!, settings, {
    start,
    continueGame: () => { ui.hide(); loop.resume(); },
    resume: () => { ui.hide(); loop.resume(); },
    pause: pauseMenu,
    endGame: toMenu,
    settingsChanged: (s) => {
      saveSettings(s);
      audio.setEnabled(s.sound);
      if (!session) audio.playMusic('menu');
      applyLanguage();
    },
    allyOrder: (o) => session?.setAllyOrder(o),
    mpCreate: () => openRoom(randomCode(), true),
    mpJoin: (code) => openRoom(code, false),
    mpLeave: () => { leaveRoom(); ui.showMultiplayer(); },
    mpConfig: (cfg) => net?.send({ t: 'cfg', cfg }),
    mpColor: (color) => net?.send({ t: 'color', color }),
    mpTeam: (team) => net?.send({ t: 'team', team }),
    mpStart: () => net?.send({ t: 'start' }),
  });

  window.addEventListener('pointerdown', () => { void platform.lockLandscape(); }, { once: true });
  platform.onResize(resize);
  platform.onVisibility((visible) => {
    tgActive = visible;
    if (visible) resumePlay();
    else suspendPlay();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !session) return;
    if (loop.running) pauseMenu();
    else if (ui.paused) { ui.hide(); loop.resume(); }
  });

  if (import.meta.env.DEV) (window as unknown as { __rt: unknown }).__rt = { get session() { return session; }, loop, ui, settings, tickOnce, renderFrame, audio };
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
  el.textContent = t('boot.failed', { message: err instanceof Error ? err.message : String(err) });
  document.body.append(el);
});
