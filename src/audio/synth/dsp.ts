/** Tiny sample-by-sample DSP toolkit used to synthesise every sound (no samples, no WebAudio needed: renders in Node too). */
export const SR = 44100;
const TAU = Math.PI * 2;

/** Deterministic white noise in [-1, 1). */
export function createNoise(seed = 1): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

export type FilterType = 'lp' | 'hp' | 'bp';

/** RBJ biquad with retunable cutoff (for filter sweeps). */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: FilterType, fc: number, q = 0.707, private sr = SR) {
    this.set(fc, q);
  }
  set(fc: number, q = 0.707): void {
    const f = Math.min(Math.max(fc, 20), this.sr * 0.45);
    const w = (TAU * f) / this.sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(q, 0.05));
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (this.type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

/** Phase-accumulating oscillator with band-limited saw/square (no harsh aliasing at 44.1 kHz). */
export class Osc {
  phase = 0;
  constructor(private sr = SR) {}
  private adv(freq: number): { p: number; dt: number } {
    const dt = Math.min(freq / this.sr, 0.45);
    const p = this.phase;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    return { p, dt };
  }
  sine(freq: number): number { const { p } = this.adv(freq); return Math.sin(TAU * p); }
  tri(freq: number): number { const { p } = this.adv(freq); return 4 * Math.abs(p - 0.5) - 1; }
  saw(freq: number): number { const { p, dt } = this.adv(freq); return 2 * p - 1 - polyBlep(p, dt); }
  square(freq: number, pw = 0.5): number {
    const { p, dt } = this.adv(freq);
    return (p < pw ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 1 - pw) % 1, dt);
  }
}

/** Render `seconds` of audio by calling `fn(t, i)` per sample. */
export function render(seconds: number, fn: (t: number, i: number) => number, sr = SR): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr, i);
  return out;
}

export const expDecay = (t: number, tau: number): number => Math.exp(-t / tau);
/** attack (linear) then exponential decay */
export const ad = (t: number, attack: number, tau: number): number => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));
export const softClip = (x: number): number => Math.tanh(x);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const noteHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Fade the last `ms` milliseconds to zero (and the first 1 ms in) so nothing ever clicks. */
export function declick(buf: Float32Array, tailMs = 20, sr = SR): Float32Array {
  const tail = Math.min(buf.length, Math.round((tailMs / 1000) * sr));
  for (let i = 0; i < tail; i++) buf[buf.length - 1 - i]! *= i / tail;
  const head = Math.min(buf.length, Math.round(0.001 * sr));
  for (let i = 0; i < head; i++) buf[i]! *= i / head;
  return buf;
}

export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max > 0) { const g = peak / max; for (let i = 0; i < buf.length; i++) buf[i]! *= g; }
  return buf;
}

/** Add `src` into `dst` starting at `at` (wraps around the end for seamless loops). */
export function mixInto(dst: Float32Array, src: Float32Array, at: number, gain = 1, wrap = false): void {
  for (let i = 0; i < src.length; i++) {
    let j = at + i;
    if (j >= dst.length) { if (!wrap) break; j %= dst.length; }
    dst[j]! += src[i]! * gain;
  }
}

/** Schroeder/Freeverb-style reverb for tails (explosions, bells). `mix` 0..1, `decay` 0..0.95. */
export function reverb(x: Float32Array, mix: number, decay: number, sr = SR): Float32Array {
  const scale = sr / 44100;
  const combs = [1116, 1188, 1277, 1356].map((d) => ({ buf: new Float32Array(Math.round(d * scale)), i: 0, lp: 0 }));
  const aps = [556, 441].map((d) => ({ buf: new Float32Array(Math.round(d * scale)), i: 0 }));
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const dry = x[n]!;
    let wet = 0;
    for (const c of combs) {
      const y = c.buf[c.i]!;
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = dry * 0.3 + c.lp * decay;
      c.i = (c.i + 1) % c.buf.length;
      wet += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i]!;
      const v = wet - y;
      a.buf[a.i] = wet + y * 0.5;
      wet = y - v * 0.5;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[n] = dry * (1 - mix) + wet * mix * 0.35;
  }
  return out;
}

/** Feedback echo. */
export function echo(x: Float32Array, delaySec: number, feedback: number, sr = SR): Float32Array {
  const d = Math.round(delaySec * sr);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! + (i >= d ? out[i - d]! * feedback : 0);
  return out;
}
