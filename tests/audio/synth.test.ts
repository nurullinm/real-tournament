import { describe, expect, it } from 'vitest';
import { SR, createNoise } from '../../src/audio/synth/dsp';
import { EFFECT_NAMES, renderEffect, type EffectName } from '../../src/audio/synth/effects';
import { MUSIC_IDS, MUSIC_SAMPLE_RATE, THEMES, musicForMap, renderTheme } from '../../src/audio/synth/music';

/** magnitude spectrum via radix-2 FFT (zero padded) */
function spectrum(x: Float32Array, size = 1 << 16): Float64Array {
  const n = size;
  const re = new Float64Array(n); const im = new Float64Array(n);
  for (let i = 0; i < Math.min(x.length, n); i++) re[i] = x[i]!;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k); const wi = Math.sin(ang * k);
      const ur = re[i + k]!; const ui = im[i + k]!;
      const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi; const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = re[i]! * re[i]! + im[i]! * im[i]!;
  return mag;
}
const bandShare = (x: Float32Array, sr: number, lo: number, hi: number): number => {
  const m = spectrum(x); const hz = sr / (m.length * 2);
  let band = 0; let all = 0;
  m.forEach((v, i) => { all += v; if (i * hz >= lo && i * hz < hi) band += v; });
  return all > 0 ? band / all : 0;
};
const peakOf = (x: Float32Array) => x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

const DURATION: Record<EffectName, [number, number]> = {
  laser: [0.15, 0.4], bazooka: [0.4, 0.9], explosion: [1.0, 2.2], saw: [0.4, 0.9], spinup: [1.2, 2.0], pickup: [0.25, 0.6],
  respawn: [0.6, 1.3], die: [0.35, 0.9], diehard: [0.5, 1.2], alarm: [0.9, 1.7], capture: [0.9, 1.8], order: [0.25, 0.6], ammo: [0.3, 0.8], weapon: [0.5, 1.1],
};

describe('sound effects (44.1 kHz synth)', () => {
  const cache = new Map<EffectName, Float32Array>();
  const get = (n: EffectName) => { if (!cache.has(n)) cache.set(n, renderEffect(n)); return cache.get(n)!; };

  it.each(EFFECT_NAMES)('%s: sensible length, loud enough, never clipping, finite', (name) => {
    const b = get(name);
    const [lo, hi] = DURATION[name];
    expect(b.length / SR).toBeGreaterThanOrEqual(lo);
    expect(b.length / SR).toBeLessThanOrEqual(hi);
    expect(b.every(Number.isFinite)).toBe(true);
    expect(peakOf(b)).toBeGreaterThan(0.5);
    expect(peakOf(b)).toBeLessThanOrEqual(0.99);
    expect(rms(b)).toBeGreaterThan(0.04);
  });

  it.each(EFFECT_NAMES)('%s: starts and ends silent (no clicks)', (name) => {
    const b = get(name);
    expect(Math.abs(b[0]!)).toBeLessThan(0.01);
    const tail = b.subarray(b.length - Math.round(0.003 * SR));
    expect(peakOf(tail)).toBeLessThan(0.02);
  });

  it('is deterministic', () => {
    expect(Array.from(renderEffect('explosion').subarray(0, 4000))).toEqual(Array.from(renderEffect('explosion').subarray(0, 4000)));
  });

  it('has real full-band content (the old 8 kHz phone-quality samples had none above 4 kHz)', () => {
    expect(bandShare(get('laser'), SR, 4000, 22000)).toBeGreaterThan(0.01);
    expect(bandShare(get('capture'), SR, 4000, 22000)).toBeGreaterThan(0.0005);
    expect(bandShare(get('explosion'), SR, 0, 400)).toBeGreaterThan(0.5); // boomy
    expect(bandShare(get('bazooka'), SR, 0, 300)).toBeGreaterThan(0.3); // heavy thump
  });

  it('effects are musically correct where it matters', () => {
    // the pickup chime is built from A5 (880 Hz) and E6 (1318.5 Hz)
    const m = spectrum(get('pickup')); const hz = SR / (m.length * 2);
    let best = 0; let bestHz = 0;
    m.forEach((v, i) => { if (i * hz > 300 && v > best) { best = v; bestHz = i * hz; } });
    expect([880, 1318.5].some((f) => Math.abs(bestHz - f) < 25)).toBe(true);
  });

  it('the order blip is a different, calmer sound than the pickup chime', () => {
    const o = get('order'); const p = get('pickup');
    expect(peakOf(o)).toBeLessThan(peakOf(p)); // quieter
    const m = spectrum(o); const hz = SR / (m.length * 2);
    let best = 0; let bestHz = 0;
    m.forEach((v, i) => { if (i * hz > 300 && v > best) { best = v; bestHz = i * hz; } });
    expect([523.25, 783.99].some((f) => Math.abs(bestHz - f) < 25)).toBe(true); // C5/G5, not the pickup's A5/E6
    expect(bandShare(o, SR, 3000, 22000)).toBeLessThan(0.05); // soft: no bright top end
  });

  describe('chainsaw', () => {
    const windowRms = (b: Float32Array, a: number, z: number) => rms(b.subarray(Math.round(a * SR), Math.round(z * SR)));
    const cv = (b: Float32Array, a: number, z: number, win = 0.01) => {
      const vals: number[] = [];
      for (let t = a; t + win <= z; t += win) vals.push(windowRms(b, t, t + win));
      const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
      return Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length) / (mean || 1);
    };

    it('the running saw is an engine: strong low body AND bright chain rattle', () => {
      const b = get('saw');
      expect(bandShare(b, SR, 80, 600)).toBeGreaterThan(0.25); // engine + exhaust
      expect(bandShare(b, SR, 2500, 8000)).toBeGreaterThan(0.003); // chain / teeth
    });

    it('the engine fires in separate pulses (a rough rumble, not a smooth tone)', () => {
      expect(cv(get('saw'), 0.1, 0.45, 0.004)).toBeGreaterThan(0.18);
    });

    it('revs up, bites into the cut and lets go (loudness follows the throttle)', () => {
      const b = get('saw');
      expect(windowRms(b, 0.2, 0.4)).toBeGreaterThan(windowRms(b, 0.0, 0.05)); // not a fade-in hiss: it builds
      expect(windowRms(b, 0.2, 0.4)).toBeGreaterThan(windowRms(b, 0.6, 0.66) * 1.5); // dies away at the end
    });

    it('the start-up pulls the cord (bright ratchet), sputters unevenly, then catches and runs steadier and louder', () => {
      const b = get('spinup');
      expect(bandShare(b.subarray(0, Math.round(0.28 * SR)), SR, 1500, 9000)).toBeGreaterThan(0.2); // cord ratchet is bright
      expect(windowRms(b, 0.95, 1.2)).toBeGreaterThan(windowRms(b, 0.05, 0.25) * 1.2); // the engine is louder than the pull
      expect(cv(b, 0.36, 0.68, 0.01)).toBeGreaterThan(cv(b, 1.05, 1.35, 0.01) * 1.1); // sputtering is more irregular than the steady run
      expect(b.length / SR).toBeGreaterThan(1.2);
    });

    it('start-up and cut are clearly different sounds and neither is a plain sawtooth', () => {
      for (const n of ['saw', 'spinup'] as const) expect(bandShare(get(n), SR, 0, 60)).toBeLessThan(0.1);
    });
  });

  describe('reload pickups', () => {
    /** number of separate sharp hits: a hit is a sudden jump of the 2 ms RMS envelope over what came just before it */
    const hits = (b: Float32Array) => {
      const win = Math.round(0.002 * SR); const env: number[] = [];
      for (let i = 0; i + win <= b.length; i += win) env.push(rms(b.subarray(i, i + win)));
      const max = Math.max(...env); let n = 0; let cooldown = 0;
      env.forEach((v, i) => {
        const before = env.slice(Math.max(0, i - 6), i).reduce((a, x) => a + x, 0) / Math.max(1, Math.min(6, i));
        if (cooldown > 0) { cooldown--; return; }
        if (v > max * 0.12 && v > before * 2.2) { n++; cooldown = 8; }
      });
      return n;
    };

    it('the ammo pickup is a mechanical sequence of hard hits (magazine in, bolt racked, release)', () => {
      expect(hits(get('ammo'))).toBeGreaterThanOrEqual(2);
      expect(bandShare(get('ammo'), SR, 100, 250)).toBeGreaterThan(0.02); // body thump
      expect(bandShare(get('ammo'), SR, 1500, 9000)).toBeGreaterThan(0.06); // metallic click
    });

    it('the weapon pickup is heavier and longer: thunderous slam plus several latch/ratchet hits', () => {
      expect(hits(get('weapon'))).toBeGreaterThanOrEqual(3);
      expect(bandShare(get('weapon'), SR, 40, 200)).toBeGreaterThan(0.15); // deep
      expect(get('weapon').length).toBeGreaterThan(get('ammo').length);
      expect(rms(get('weapon').subarray(0, 4000))).toBeGreaterThan(rms(get('ammo').subarray(0, 4000)) * 0.9);
    });

    it('both are punchy and unlike the soft health/armor chime', () => {
      for (const n of ['ammo', 'weapon'] as const) {
        expect(peakOf(get(n))).toBeGreaterThan(0.85);
        expect(bandShare(get(n), SR, 700, 1500)).toBeLessThan(0.7); // not a tone
      }
      expect(rms(get('weapon').subarray(0, 2000))).toBeGreaterThan(rms(get('pickup').subarray(0, 2000)));
    });
  });

  it('every effect sounds different from every other', () => {
    const head = (n: EffectName) => Array.from(get(n).subarray(0, 2000));
    const corr = (a: number[], b: number[]) => { let s = 0; let na = 0; let nb = 0; for (let i = 0; i < a.length; i++) { s += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; } return Math.abs(s) / Math.sqrt(na * nb || 1); };
    for (const a of EFFECT_NAMES) for (const b of EFFECT_NAMES) if (a < b) expect(corr(head(a), head(b)), `${a}/${b}`).toBeLessThan(0.9);
  });
});

describe('background music', () => {
  it('has a theme for the menu and every map', () => {
    expect(MUSIC_IDS.sort()).toEqual(['ctf0', 'ctf1', 'ctf2', 'ctf3', 'ctf4', 'dm0', 'dm1', 'dm2', 'dm3', 'dm4', 'dm5', 'dm6', 'menu']);
    for (let m = 0; m < 12; m++) expect(THEMES[musicForMap(m)], `map ${m}`).toBeDefined();
    expect(musicForMap(0)).toBe('dm0');
    expect(musicForMap(6)).toBe('dm6');
    expect(musicForMap(7)).toBe('ctf0');
    expect(musicForMap(11)).toBe('ctf4');
  });

  it('themes are distinct (tempo/key/feel differ across maps)', () => {
    const sig = (id: string) => `${THEMES[id]!.bpm}/${THEMES[id]!.scale}/${THEMES[id]!.root}/${THEMES[id]!.bass?.pattern}`;
    expect(new Set(MUSIC_IDS.map(sig)).size).toBe(MUSIC_IDS.length);
  });

  it.each(MUSIC_IDS)('%s renders a seamless, quiet-enough, non-harsh stereo loop', async (id) => {
    const t = THEMES[id]!;
    const { left, right, sr } = await renderTheme(t);
    expect(sr).toBe(MUSIC_SAMPLE_RATE);
    const stepsPerBar = 16;
    expect(left.length).toBe(Math.round((60 / t.bpm / 4) * sr) * stepsPerBar * t.bars);
    expect(left.length / sr).toBeGreaterThan(10);
    expect(left.length / sr).toBeLessThan(30);
    expect(left.every(Number.isFinite) && right.every(Number.isFinite)).toBe(true);
    expect(Math.max(peakOf(left), peakOf(right))).toBeLessThanOrEqual(0.81);
    expect(rms(left)).toBeGreaterThan(0.04);
    expect(rms(left)).toBeLessThan(0.45);
    // seamless: the wrap-around step is no bigger than a normal sample-to-sample step plus a little
    let maxStep = 0;
    for (let i = 1; i < left.length; i++) maxStep = Math.max(maxStep, Math.abs(left[i]! - left[i - 1]!));
    expect(Math.abs(left[0]! - left[left.length - 1]!)).toBeLessThanOrEqual(maxStep + 0.02);
    // music must not eat the effects' space: little energy in the harsh top band
    expect(bandShare(left.subarray(0, 1 << 16), sr, 8000, 16000)).toBeLessThan(0.02);
  }, 30_000);

  it('renders pads in stereo (left differs from right)', async () => {
    const { left, right } = await renderTheme(THEMES.menu!);
    let diff = 0;
    for (let i = 0; i < left.length; i += 97) diff += Math.abs(left[i]! - right[i]!);
    expect(diff).toBeGreaterThan(1);
  }, 30_000);

  it('renders in chunks, letting the caller yield between them', async () => {
    let yields = 0;
    await renderTheme(THEMES.dm0!, MUSIC_SAMPLE_RATE, async () => { yields++; });
    expect(yields).toBeGreaterThan(3);
  }, 30_000);
});

describe('noise source', () => {
  it('is deterministic per seed and uses the full [-1, 1) range', () => {
    const a = createNoise(5); const b = createNoise(5);
    const xs = Array.from({ length: 2000 }, a);
    expect(xs).toEqual(Array.from({ length: 2000 }, b));
    expect(Math.min(...xs)).toBeLessThan(-0.9);
    expect(Math.max(...xs)).toBeGreaterThan(0.9);
  });
});
