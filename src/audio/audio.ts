import { EFFECT_NAMES, EFFECT_SAMPLE_RATE, renderEffect, type EffectName } from './synth/effects';
import { THEMES, renderTheme, type MusicId } from './synth/music';

export type { MusicId };
export { musicForMap } from './synth/music';
/** Engine events use these names; `itemrespawn` is intentionally silent. */
export type SoundName = EffectName | 'itemrespawn';

const COOLDOWN_MS: Partial<Record<SoundName, number>> = { laser: 60, saw: 200, explosion: 80, die: 120, diehard: 200, order: 150, ammo: 120, weapon: 120 };
const MAX_VOICES = 10;
const MUSIC_LEVEL_MENU = 0.5;
const MUSIC_LEVEL_GAME = 0.3;
/** effects that briefly pull the music down so they stay clear */
const DUCKS: ReadonlySet<SoundName> = new Set(['explosion', 'diehard', 'die', 'capture', 'alarm']);

export interface BufferLike {
  copyToChannel(src: Float32Array, channel: number): void;
}
interface GainNodeLike {
  gain: { value: number; setValueAtTime?(v: number, t: number): void; linearRampToValueAtTime?(v: number, t: number): void; setTargetAtTime?(v: number, t: number, k: number): void; cancelScheduledValues?(t: number): void };
  connect(n: unknown): void;
}
interface SourceLike {
  buffer: unknown; loop: boolean; connect(n: unknown): void; start(t?: number): void; stop(t?: number): void; onended: (() => void) | null;
}
/** Minimal WebAudio surface the module needs (injectable for tests). */
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state: string;
  onstatechange: (() => void) | null;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): SourceLike;
  createGain(): GainNodeLike;
}
export interface AudioDeps {
  createContext(): AudioContextLike;
  now(): number;
  /** lets long synth renders give the UI thread a breath */
  yield(): Promise<void>;
  renderMusic(id: MusicId, yieldFn: () => Promise<void>): Promise<{ left: Float32Array; right: Float32Array; sr: number }>;
}

export interface Audio {
  /** Creates the audio context and renders all sounds; safe to call before any user gesture. */
  init(): void;
  /** Call from a user gesture (touch/click/key): resumes a suspended context. Idempotent. */
  unlock(): Promise<void>;
  readonly running: boolean;
  /** the music loop that is actually audible right now (null while loading, blocked or stopped) */
  readonly nowPlaying: MusicId | null;
  play(name: SoundName, volume?: number): void;
  /** Loop for the menu or a map; null stops the music. Starts as soon as sound is allowed. */
  playMusic(id: MusicId | null): void;
  setEnabled(on: boolean): void;
  suspend(): void;
  resume(): void;
  /** Cheap health check, safe to call often (timer, focus, visibility): revives audio that the OS interrupted (screen lock, call). */
  poke(): void;
}

export function createAudio(deps?: Partial<AudioDeps>): Audio {
  const d: AudioDeps = {
    createContext: () => new (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() as unknown as AudioContextLike,
    now: () => Date.now(),
    yield: () => new Promise<void>((r) => setTimeout(r, 0)),
    renderMusic: (id, yieldFn) => renderTheme(THEMES[id]!, undefined, yieldFn),
    ...deps,
  };
  let ctx: AudioContextLike | null = null;
  const effects = new Map<EffectName, BufferLike>();
  const music = new Map<MusicId, BufferLike>();
  const musicLoading = new Set<MusicId>();
  /** themes whose render failed: never retried (a retry loop would burn the CPU forever) */
  const musicFailed = new Set<MusicId>();
  const last = new Map<SoundName, number>();
  let voices = 0;
  let enabled = true;
  let suspended = false;
  let wanted: MusicId | null = null;
  let playing: { id: MusicId; src: SourceLike; gain: GainNodeLike; level: number } | null = null;
  let started = false;

  const isRunning = (): boolean => ctx?.state === 'running';

  function stopMusic(fade = 0.35): void {
    const p = playing;
    playing = null;
    if (!p || !ctx) return;
    try {
      const t = ctx.currentTime;
      if (p.gain.gain.linearRampToValueAtTime) {
        p.gain.gain.cancelScheduledValues?.(t);
        p.gain.gain.setValueAtTime?.(p.gain.gain.value, t);
        p.gain.gain.linearRampToValueAtTime(0, t + fade);
        p.src.stop(t + fade + 0.05);
      } else {
        p.src.stop();
      }
    } catch {
      /* already stopped */
    }
  }

  function startMusic(): void {
    if (!ctx || !wanted || !enabled || suspended || !isRunning()) return;
    if (playing?.id === wanted) return;
    const buf = music.get(wanted);
    if (!buf) { if (!musicFailed.has(wanted)) void loadMusic(wanted); return; }
    stopMusic();
    const level = wanted === 'menu' ? MUSIC_LEVEL_MENU : MUSIC_LEVEL_GAME;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    if (gain.gain.setValueAtTime && gain.gain.linearRampToValueAtTime) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + 1.2); // fade in
    } else {
      gain.gain.value = level;
    }
    src.start();
    playing = { id: wanted, src, gain, level };
  }

  async function loadMusic(id: MusicId): Promise<void> {
    if (!ctx || music.has(id) || musicLoading.has(id) || musicFailed.has(id)) return;
    musicLoading.add(id);
    try {
      const r = await d.renderMusic(id, d.yield);
      const b = ctx.createBuffer(2, r.left.length, r.sr);
      b.copyToChannel(r.left, 0);
      b.copyToChannel(r.right, 1);
      music.set(id, b);
      // keep memory small: the menu loop and the current one
      for (const k of [...music.keys()]) if (k !== 'menu' && k !== wanted && k !== id) music.delete(k);
    } catch {
      musicFailed.add(id); // no music is better than a crash or a retry storm
    } finally {
      musicLoading.delete(id);
    }
    startMusic();
  }

  async function renderEffects(): Promise<void> {
    for (const name of EFFECT_NAMES) {
      if (!ctx) return;
      const data = renderEffect(name);
      const b = ctx.createBuffer(1, data.length, EFFECT_SAMPLE_RATE);
      b.copyToChannel(data, 0);
      effects.set(name, b);
      await d.yield();
    }
  }

  function duck(): void {
    const p = playing;
    if (!p || !ctx || !p.gain.gain.setTargetAtTime) return;
    const t = ctx.currentTime;
    p.gain.gain.setTargetAtTime(p.level * 0.4, t, 0.015);
    p.gain.gain.setTargetAtTime(p.level, t + 0.5, 0.25);
  }

  /** Brings the context back after an interruption (iOS 'interrupted', lock screen, Telegram minimise); recreates it if the OS closed it. */
  async function ensureRunning(): Promise<void> {
    if (!ctx) return;
    if (ctx.state === 'closed') rebuild();
    try {
      if (ctx && ctx.state !== 'running') await ctx.resume();
    } catch {
      /* the OS wants a user gesture first: the next touch/key calls unlock() */
    }
    startMusic();
  }

  /** A closed context cannot be reopened: build a fresh one and re-render the sounds. */
  function rebuild(): void {
    if (ctx) ctx.onstatechange = null;
    ctx = null;
    started = false;
    effects.clear();
    music.clear();
    musicLoading.clear();
    playing = null;
    api.init();
  }

  const api: Audio = {
    init(): void {
      if (started) return;
      started = true;
      ctx = d.createContext();
      ctx.onstatechange = () => startMusic();
      // some webviews allow audio without a gesture: try right away, otherwise the first touch does it
      void ctx.resume().then(() => startMusic(), () => {});
      void renderEffects();
      if (wanted) void loadMusic(wanted);
    },
    async unlock(): Promise<void> {
      api.init();
      if (!ctx) return;
      if (ctx.state === 'closed') rebuild();
      if (ctx.state === 'running' && !suspended) { startMusic(); return; } // already fine: touches stay cheap
      suspended = false;
      try {
        // iOS: a started (silent) source inside the gesture is what really unlocks output
        const silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, 22050);
        silent.connect(ctx.destination);
        silent.start(0);
      } catch {
        /* not essential */
      }
      await ctx.resume();
      startMusic();
    },
    get running(): boolean {
      return isRunning();
    },
    get nowPlaying(): MusicId | null {
      return playing?.id ?? null;
    },
    play(name, volume = 1): void {
      if (!ctx || !enabled || suspended || volume <= 0 || !isRunning()) return;
      const now = d.now();
      const cd = COOLDOWN_MS[name] ?? 40;
      if (now - (last.get(name) ?? -1e9) < cd) return;
      last.set(name, now);
      if (name === 'itemrespawn') return;
      const buf = effects.get(name);
      if (!buf || voices >= MAX_VOICES) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buf;
      src.loop = false;
      src.connect(gain);
      gain.connect(ctx.destination);
      voices++;
      src.onended = () => { voices--; };
      src.start();
      if (DUCKS.has(name)) duck();
    },
    playMusic(id): void {
      wanted = id;
      if (!id) { stopMusic(); return; }
      if (ctx) void loadMusic(id);
      startMusic();
    },
    setEnabled(on): void {
      enabled = on;
      if (!on) stopMusic();
      else startMusic();
    },
    suspend(): void {
      suspended = true;
      stopMusic(0.05);
      void ctx?.suspend();
    },
    resume(): void {
      suspended = false;
      void ensureRunning();
    },
    poke(): void {
      if (!started || suspended) return; // paused on purpose (hidden, minimised, portrait)
      if (!isRunning()) void ensureRunning();
    },
  };
  return api;
}
