export type SoundName =
  | 'saw' | 'explosion' | 'respawn' | 'bazooka' | 'laser' | 'pickup' | 'itemrespawn'
  | 'die' | 'diehard' | 'alarm' | 'capture' | 'spinup';

/** Effects with an original recording; pickups are synthesised (silent in the original). */
const FILES: Partial<Record<SoundName, string>> = {
  saw: 'saw', explosion: 'explosion', respawn: 'respawn', bazooka: 'bazooka', laser: 'laser',
  die: 'die', diehard: 'diehard', alarm: 'alarm', capture: 'capture', spinup: 'spinup',
};
const COOLDOWN_MS: Partial<Record<SoundName, number>> = { laser: 60, saw: 200, explosion: 80, die: 120, diehard: 200 };
const MAX_VOICES = 10;

/** Minimal WebAudio surface the module needs (injectable for tests). */
export interface AudioDeps {
  createContext(): AudioContextLike;
  fetchBytes(url: string): Promise<ArrayBuffer>;
  now(): number;
}
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  decodeAudioData(b: ArrayBuffer): Promise<unknown>;
  createBufferSource(): { buffer: unknown; loop: boolean; connect(n: unknown): void; start(t?: number): void; stop(): void; onended: (() => void) | null };
  createGain(): { gain: { value: number }; connect(n: unknown): void };
  createOscillator(): { type: string; frequency: { setValueAtTime(v: number, t: number): void }; connect(n: unknown): void; start(t: number): void; stop(t: number): void };
}

export interface Audio {
  /** Call from the first user gesture (touch): creates/resumes the context and loads the sounds. */
  unlock(): Promise<void>;
  play(name: SoundName, volume?: number): void;
  music(on: boolean): void;
  setEnabled(on: boolean): void;
  suspend(): void;
  resume(): void;
}

export function createAudio(base = 'audio/', deps?: Partial<AudioDeps>): Audio {
  const d: AudioDeps = {
    createContext: () => new (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() as unknown as AudioContextLike,
    fetchBytes: async (u) => (await fetch(u)).arrayBuffer(),
    now: () => Date.now(),
    ...deps,
  };
  let ctx: AudioContextLike | null = null;
  const buffers = new Map<string, unknown>();
  const last = new Map<SoundName, number>();
  let voices = 0;
  let enabled = true;
  let wantMusic = false;
  let musicNode: { stop(): void } | null = null;
  let suspended = false;

  const startMusic = (): void => {
    const buf = buffers.get('intro');
    if (!ctx || !buf || musicNode || !wantMusic || !enabled || suspended) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    musicNode = src;
  };
  const stopMusic = (): void => {
    musicNode?.stop();
    musicNode = null;
  };

  function blip(freqs: number[], volume: number): void {
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.18 * volume;
    gain.connect(ctx.destination);
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, ctx!.currentTime + i * 0.06);
      osc.connect(gain);
      osc.start(ctx!.currentTime + i * 0.06);
      osc.stop(ctx!.currentTime + i * 0.06 + 0.06);
    });
  }

  return {
    async unlock(): Promise<void> {
      if (!ctx) {
        ctx = d.createContext();
        const names = [...Object.values(FILES), 'intro'] as string[];
        await Promise.all(names.map(async (n) => {
          try {
            buffers.set(n, await ctx!.decodeAudioData(await d.fetchBytes(`${base}${n}.wav`)));
          } catch {
            /* a missing/undecodable file just stays silent */
          }
        }));
      }
      suspended = false;
      await ctx.resume();
      startMusic();
    },
    play(name, volume = 1): void {
      if (!ctx || !enabled || suspended || volume <= 0) return;
      const now = d.now();
      const cd = COOLDOWN_MS[name] ?? 40;
      if (now - (last.get(name) ?? -1e9) < cd) return;
      last.set(name, now);
      if (name === 'pickup') return blip([660, 990], volume);
      if (name === 'itemrespawn') return;
      const file = FILES[name];
      const buf = file && buffers.get(file);
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
    },
    music(on): void {
      wantMusic = on;
      if (on) startMusic();
      else stopMusic();
    },
    setEnabled(on): void {
      enabled = on;
      if (!on) stopMusic();
      else startMusic();
    },
    suspend(): void {
      suspended = true;
      stopMusic();
      void ctx?.suspend();
    },
    resume(): void {
      suspended = false;
      void ctx?.resume();
      startMusic();
    },
  };
}
