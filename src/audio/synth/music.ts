import { Biquad, Osc, createNoise, expDecay, mixInto, noteHz, normalize, render, softClip } from './dsp';

/** Procedural background music: every theme is a small data record rendered by the same voices (bass, pad, arp, lead, drums). */
export const MUSIC_SAMPLE_RATE = 32000;

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;
type ScaleName = keyof typeof SCALES;
type Wave = 'saw' | 'square' | 'tri' | 'sine';

export interface Theme {
  bpm: number;
  /** length of the loop in bars (4/4) */
  bars: number;
  /** MIDI note of the tonic (the bass plays around it) */
  root: number;
  scale: ScaleName;
  /** chord root as a scale degree for every bar (repeats if shorter than `bars`) */
  prog: number[];
  /** 16-step patterns per bar: 'x' hit, 'X' accent, '.' rest */
  bass?: { pattern: string; wave: Wave; cutoff: number; level: number; octave?: number };
  pad?: { level: number; cutoff: number; attack: number; detune?: number; seventh?: boolean };
  /** digits index chord tones (0 root, 1 third, 2 fifth, 3 seventh, 4 ninth ...) */
  arp?: { pattern: string; wave: Wave; level: number; octave: number; decay: number; cutoff?: number; echo?: number };
  drums?: { kick?: string; snare?: string; hat?: string; level: number };
  /** sparse melody: [startStep, scaleDegree, lengthSteps], steps counted across the whole loop */
  lead?: { notes: [number, number, number][]; wave: Wave; level: number; octave: number };
}

const degreeMidi = (t: Theme, degree: number): number => {
  const sc = SCALES[t.scale];
  const oct = Math.floor(degree / 7);
  return t.root + oct * 12 + sc[((degree % 7) + 7) % 7]!;
};

function voice(wave: Wave, o: Osc, f: number): number {
  return wave === 'saw' ? o.saw(f) : wave === 'square' ? o.square(f) : wave === 'tri' ? o.tri(f) : o.sine(f);
}

function bassNote(f: number, len: number, wave: Wave, cutoff: number, sr: number): Float32Array {
  const o = new Osc(sr); const lp = new Biquad('lp', cutoff, 0.9, sr);
  return render(len / sr + 0.04, (t) => {
    lp.set(cutoff * (1 + 1.6 * expDecay(t, 0.09)), 0.9);
    const env = Math.min(1, t / 0.006) * (t < len / sr ? 1 : expDecay(t - len / sr, 0.015));
    return lp.process(voice(wave, o, f)) * env;
  }, sr);
}

function padNote(f: number, len: number, cutoff: number, attack: number, detune: number, sr: number): Float32Array {
  const a = new Osc(sr); const b = new Osc(sr); const lp = new Biquad('lp', cutoff, 0.6, sr);
  const dur = len / sr; const rel = 0.6;
  return render(dur + rel, (t) => {
    const env = Math.min(1, t / attack) * (t < dur ? 1 : expDecay(t - dur, rel * 0.35));
    return lp.process(a.saw(f * (1 - detune)) * 0.5 + b.saw(f * (1 + detune)) * 0.5) * env;
  }, sr);
}

function pluck(f: number, wave: Wave, decay: number, cutoff: number, sr: number): Float32Array {
  const o = new Osc(sr); const lp = new Biquad('lp', cutoff, 0.8, sr);
  return render(decay * 6 + 0.02, (t) => lp.process(voice(wave, o, f)) * Math.min(1, t / 0.003) * expDecay(t, decay), sr);
}

const kickHit = (sr: number): Float32Array => {
  const o = new Osc(sr);
  return render(0.26, (t) => o.sine(46 + 120 * Math.exp(-t * 28)) * Math.min(1, t / 0.002) * expDecay(t, 0.09) * 1.2, sr);
};
const snareHit = (sr: number, seed: number): Float32Array => {
  const n = createNoise(seed); const bp = new Biquad('bp', 1900, 0.9, sr); const o = new Osc(sr);
  return render(0.22, (t) => (bp.process(n()) * 1.3 * expDecay(t, 0.07) + o.tri(190) * 0.5 * expDecay(t, 0.05)) * Math.min(1, t / 0.001), sr);
};
const hatHit = (sr: number, seed: number): Float32Array => {
  const n = createNoise(seed); const hp = new Biquad('hp', 7000, 0.7, sr);
  return render(0.07, (t) => hp.process(n()) * expDecay(t, 0.02), sr);
};

/** Renders one seamless loop (stereo). `yieldFn` lets callers keep the UI responsive while it renders. */
export async function renderTheme(theme: Theme, sr = MUSIC_SAMPLE_RATE, yieldFn: () => Promise<void> = async () => {}, seed = 1): Promise<{ left: Float32Array; right: Float32Array; sr: number }> {
  const stepSec = 60 / theme.bpm / 4;
  const step = Math.round(stepSec * sr);
  const total = step * 16 * theme.bars;
  const L = new Float32Array(total); const R = new Float32Array(total);
  const both = (src: Float32Array, at: number, g: number): void => { mixInto(L, src, at, g, true); mixInto(R, src, at, g, true); };
  let work = 0;
  const tick = async (): Promise<void> => { if (++work % 6 === 0) await yieldFn(); };

  for (let bar = 0; bar < theme.bars; bar++) {
    const deg = theme.prog[bar % theme.prog.length]!;
    const barStart = bar * 16 * step;

    if (theme.pad) {
      const p = theme.pad;
      const tones = [0, 2, 4, ...(p.seventh ? [6] : [])].map((k) => degreeMidi(theme, deg + k + 7));
      for (const m of tones) {
        const f = noteHz(m);
        mixInto(L, padNote(f, 16 * step, p.cutoff, p.attack, p.detune ?? 0.004, sr), barStart, p.level * 0.22, true);
        mixInto(R, padNote(f, 16 * step, p.cutoff, p.attack, -(p.detune ?? 0.004), sr), barStart, p.level * 0.22, true);
      }
      await tick();
    }

    if (theme.bass) {
      const b = theme.bass;
      const hits = [...b.pattern].map((c, i) => (c === '.' ? -1 : i)).filter((i) => i >= 0);
      const f = noteHz(degreeMidi(theme, deg) - 12 + (b.octave ?? 0) * 12);
      hits.forEach((i, idx) => {
        const next = hits[idx + 1] ?? 16;
        const note = bassNote(f, Math.max(1, Math.round((next - i) * step * 0.92)), b.wave, b.cutoff, sr);
        both(note, barStart + i * step, b.level * 0.42 * (b.pattern[i] === 'X' ? 1.2 : 1));
      });
      await tick();
    }

    if (theme.arp) {
      const a = theme.arp;
      for (let i = 0; i < 16; i++) {
        const c = a.pattern[i];
        if (!c || c === '.') continue;
        const f = noteHz(degreeMidi(theme, deg + 2 * Number(c)) + a.octave * 12);
        const note = pluck(f, a.wave, a.decay, a.cutoff ?? 3200, sr);
        const pan = i % 2 === 0 ? 0.65 : 0.35;
        const at = barStart + i * step;
        mixInto(L, note, at, a.level * 0.26 * (1 - pan) * 2, true);
        mixInto(R, note, at, a.level * 0.26 * pan * 2, true);
        if (a.echo) {
          const eAt = at + Math.round(step * 3);
          mixInto(L, note, eAt, a.level * 0.26 * pan * a.echo * 2, true);
          mixInto(R, note, eAt, a.level * 0.26 * (1 - pan) * a.echo * 2, true);
        }
      }
      await tick();
    }

    if (theme.drums) {
      const d = theme.drums;
      const hit = (pat: string | undefined, fn: () => Float32Array, g: number): void => {
        if (!pat) return;
        for (let i = 0; i < 16; i++) { const c = pat[i]; if (c && c !== '.') both(fn(), barStart + i * step, g * d.level * (c === 'X' ? 1.25 : 1)); }
      };
      hit(d.kick, () => kickHit(sr), 0.5);
      hit(d.snare, () => snareHit(sr, seed + bar), 0.32);
      hit(d.hat, () => hatHit(sr, seed + 100 + bar), 0.16);
      await tick();
    }
  }

  if (theme.lead) {
    const l = theme.lead;
    for (const [start, degree, len] of l.notes) {
      const f = noteHz(degreeMidi(theme, degree) + l.octave * 12);
      const o = new Osc(sr); const lp = new Biquad('lp', 2800, 0.7, sr);
      const dur = len * step / sr;
      const note = render(dur + 0.4, (t) => {
        const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.3);
        const env = Math.min(1, t / 0.03) * (t < dur ? 1 : expDecay(t - dur, 0.12));
        return lp.process(voice(l.wave, o, f * vib)) * env;
      }, sr);
      both(note, (start * step) % total, l.level * 0.2);
      await tick();
    }
  }

  // gentle master: soft saturation, rolled-off highs (music must never fight the sound effects), peak 0.8
  const lpL = new Biquad('lp', 6500, 0.7, sr); const lpR = new Biquad('lp', 6500, 0.7, sr);
  const sL = Float32Array.from(L); const sR = Float32Array.from(R);
  // two passes: the first only warms the filter state up, so the loop's last sample flows into its first without a seam
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < total; i++) { L[i] = lpL.process(softClip(sL[i]! * 1.1)); R[i] = lpR.process(softClip(sR[i]! * 1.1)); }
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
  const g = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < total; i++) { L[i]! *= g; R[i]! *= g; }
  void normalize;
  return { left: L, right: R, sr };
}

export const THEMES: Record<string, Theme> = {
  // main menu: slow, moody sci-fi
  menu: {
    bpm: 88, bars: 8, root: 45, scale: 'minor', prog: [0, 5, 3, 4, 0, 5, 3, 6],
    bass: { pattern: 'x.......x.......', wave: 'saw', cutoff: 320, level: 0.8 },
    pad: { level: 0.8, cutoff: 1200, attack: 0.7, seventh: true },
    arp: { pattern: '0.1.2.1.0.2.1.2.', wave: 'tri', level: 0.4, octave: 1, decay: 0.22, echo: 0.35 },
    drums: { kick: 'x.......x.......', hat: '..x...x...x...x.', level: 0.35 },
  },
  // deathmatch maps
  dm0: { // Two floors: industrial pulse
    bpm: 118, bars: 8, root: 40, scale: 'minor', prog: [0, 0, 5, 4, 0, 0, 3, 4],
    bass: { pattern: '.x.x.x.x.x.x.x.x', wave: 'saw', cutoff: 520, level: 0.85 },
    pad: { level: 0.35, cutoff: 900, attack: 0.4 },
    arp: { pattern: '0.2.1.2.0.2.1.3.', wave: 'tri', level: 0.3, octave: 1, decay: 0.16, echo: 0.25 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', level: 0.55 },
  },
  dm1: { // King of the hill: heroic dorian
    bpm: 104, bars: 8, root: 43, scale: 'dorian', prog: [0, 3, 4, 0, 0, 3, 6, 4],
    bass: { pattern: 'x..x..x.x..x..x.', wave: 'saw', cutoff: 480, level: 0.8 },
    pad: { level: 0.6, cutoff: 1800, attack: 0.45 },
    arp: { pattern: '0.1.2.4.2.1.0.1.', wave: 'sine', level: 0.3, octave: 1, decay: 0.2, echo: 0.3 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', level: 0.5 },
    lead: { wave: 'tri', level: 0.6, octave: 1, notes: [[0, 4, 6], [8, 6, 4], [16, 4, 4], [24, 7, 8], [32, 6, 6], [40, 4, 4], [48, 2, 6], [56, 4, 8], [64, 4, 6], [72, 6, 4], [80, 7, 6], [88, 9, 8], [96, 7, 6], [104, 6, 4], [112, 4, 6], [120, 4, 8]] },
  },
  dm2: { // Stowaways: stealthy phrygian
    bpm: 82, bars: 8, root: 38, scale: 'phrygian', prog: [0, 1, 0, 1, 0, 6, 0, 1],
    bass: { pattern: 'x.......x.....x.', wave: 'sine', cutoff: 300, level: 0.9 },
    pad: { level: 0.6, cutoff: 800, attack: 0.9 },
    arp: { pattern: '0.....2...1.....', wave: 'sine', level: 0.3, octave: 1, decay: 0.3, echo: 0.5 },
    drums: { kick: 'x.....x.........', hat: '....x.......x...', level: 0.28 },
  },
  dm3: { // Island of freedom: airy lydian
    bpm: 96, bars: 8, root: 48, scale: 'lydian', prog: [0, 1, 4, 0, 0, 1, 3, 4],
    bass: { pattern: 'x.......x.......', wave: 'sine', cutoff: 400, level: 0.8 },
    pad: { level: 0.75, cutoff: 2200, attack: 0.8, seventh: true },
    arp: { pattern: '0.1.2.3.4.3.2.1.', wave: 'tri', level: 0.35, octave: 1, decay: 0.22, echo: 0.45 },
    drums: { kick: 'x.......x.......', hat: '..x...x...x...x.', level: 0.25 },
  },
  dm4: { // Cycle-drome: fast synthwave
    bpm: 132, bars: 8, root: 41, scale: 'minor', prog: [0, 5, 2, 6, 0, 5, 2, 6],
    bass: { pattern: 'x.xxx.xxx.xxx.xx', wave: 'saw', cutoff: 620, level: 0.8 },
    pad: { level: 0.4, cutoff: 1500, attack: 0.3 },
    arp: { pattern: '0123210123210123', wave: 'saw', level: 0.22, octave: 1, decay: 0.12, cutoff: 2200 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', level: 0.55 },
  },
  dm5: { // Skyscraper: cinematic and wide
    bpm: 74, bars: 8, root: 41, scale: 'lydian', prog: [0, 4, 5, 3, 0, 4, 5, 6],
    bass: { pattern: 'x...............', wave: 'sine', cutoff: 280, level: 0.9 },
    pad: { level: 0.95, cutoff: 2600, attack: 1.2, seventh: true },
    arp: { pattern: '0...2...4...2...', wave: 'sine', level: 0.3, octave: 2, decay: 0.35, echo: 0.5 },
    drums: { kick: 'x...............', level: 0.4 },
  },
  dm6: { // No place to hide: paranoid pulse
    bpm: 98, bars: 8, root: 37, scale: 'phrygian', prog: [0, 0, 1, 0, 0, 0, 1, 6],
    bass: { pattern: 'xx.xx.xx.xx.xx.x', wave: 'saw', cutoff: 380, level: 0.85 },
    pad: { level: 0.3, cutoff: 700, attack: 0.5 },
    arp: { pattern: '0.2.0.3.0.2.0.4.', wave: 'square', level: 0.2, octave: 1, decay: 0.1, cutoff: 1300 },
    drums: { kick: 'x..x..x..x..x...', hat: '...x...x...x...x', level: 0.35 },
  },
  // capture the flag maps
  ctf0: { // Saboteurs: sneaky groove
    bpm: 90, bars: 8, root: 45, scale: 'dorian', prog: [0, 0, 3, 3, 4, 4, 0, 6],
    bass: { pattern: '.x..x..x.x..x...', wave: 'saw', cutoff: 360, level: 0.8 },
    pad: { level: 0.4, cutoff: 1000, attack: 0.5 },
    arp: { pattern: '0.1.0.2.0.1.0.3.', wave: 'tri', level: 0.3, octave: 1, decay: 0.18, echo: 0.25 },
    drums: { kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.xx', level: 0.3 },
  },
  ctf1: { // Chaos and order: restless, off-beat
    bpm: 128, bars: 8, root: 43, scale: 'minor', prog: [0, 6, 0, 5, 0, 6, 3, 4],
    bass: { pattern: 'x.xx.x.xx.xx.x.x', wave: 'square', cutoff: 900, level: 0.75 },
    pad: { level: 0.35, cutoff: 1200, attack: 0.3 },
    arp: { pattern: '0.2.1.3.0.1.4.2.', wave: 'tri', level: 0.28, octave: 1, decay: 0.12, echo: 0.3 },
    drums: { kick: 'x..x..x.x..x..x.', snare: '....x..x....x...', hat: 'xx.xx.xx.xx.xx.x', level: 0.5 },
  },
  ctf2: { // Two towers: epic minor
    bpm: 100, bars: 8, root: 38, scale: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4],
    bass: { pattern: 'x.......x.......', wave: 'saw', cutoff: 420, level: 0.85 },
    pad: { level: 0.85, cutoff: 2000, attack: 0.7, detune: 0.007, seventh: true },
    arp: { pattern: '0.2.4.2.0.2.4.5.', wave: 'tri', level: 0.28, octave: 1, decay: 0.2, echo: 0.35 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', level: 0.5 },
    lead: { wave: 'saw', level: 0.4, octave: 1, notes: [[0, 4, 8], [16, 6, 8], [32, 4, 6], [48, 2, 8], [64, 4, 8], [80, 6, 8], [96, 7, 6], [112, 4, 12]] },
  },
  ctf3: { // Technopark: bright electro-pop
    bpm: 124, bars: 8, root: 48, scale: 'major', prog: [0, 4, 5, 3, 0, 4, 5, 3],
    bass: { pattern: '.x.x.x.x.x.x.x.x', wave: 'saw', cutoff: 650, level: 0.75 },
    pad: { level: 0.5, cutoff: 2400, attack: 0.35 },
    arp: { pattern: '0.1.2.1.0.1.2.4.', wave: 'saw', level: 0.24, octave: 1, decay: 0.12, cutoff: 3000 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x', level: 0.5 },
  },
  ctf4: { // Major road: driving
    bpm: 138, bars: 8, root: 45, scale: 'mixolydian', prog: [0, 6, 4, 0, 0, 6, 3, 4],
    bass: { pattern: 'xxxxxxxxxxxxxxxx', wave: 'saw', cutoff: 460, level: 0.7 },
    pad: { level: 0.45, cutoff: 1400, attack: 0.3 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', level: 0.55 },
  },
};

export type MusicId = 'menu' | 'dm0' | 'dm1' | 'dm2' | 'dm3' | 'dm4' | 'dm5' | 'dm6' | 'ctf0' | 'ctf1' | 'ctf2' | 'ctf3' | 'ctf4';
export const MUSIC_IDS = Object.keys(THEMES) as MusicId[];
/** Map index 0-6 are Deathmatch maps, 7-11 CTF maps. */
export const musicForMap = (mapId: number): MusicId => (mapId < 7 ? (`dm${Math.max(0, mapId)}` as MusicId) : (`ctf${Math.min(4, mapId - 7)}` as MusicId));
