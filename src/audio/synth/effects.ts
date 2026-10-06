import { Biquad, Osc, SR, ad, createNoise, declick, echo, expDecay, lerp, normalize, render, reverb, softClip } from './dsp';

/** Sound effects, synthesised at 44.1 kHz. Modern sci-fi flavour: layered tones + filtered noise + sub bass. */
export type EffectName =
  | 'laser' | 'bazooka' | 'explosion' | 'saw' | 'spinup' | 'pickup' | 'respawn' | 'die' | 'diehard' | 'alarm' | 'capture' | 'order' | 'ammo' | 'weapon';

const finish = (buf: Float32Array, peak: number, tailMs = 25): Float32Array => normalize(declick(buf, tailMs), peak);

/** Pistol: a bright downward "zap" with a thick detuned core, a snap at the start and a high shimmer. */
function laser(): Float32Array {
  const a = new Osc(); const b = new Osc(); const c = new Osc(); const noise = createNoise(11);
  const hp = new Biquad('hp', 250, 0.7); const lp = new Biquad('lp', 9000, 0.7); const click = new Biquad('hp', 3500, 0.7);
  return finish(render(0.24, (t) => {
    const f = 2300 * Math.exp(-t * 11) + 420;
    lp.set(lerp(9000, 2500, Math.min(1, t / 0.2)), 0.8);
    const core = a.saw(f) * 0.5 + b.saw(f * 1.006) * 0.4 + c.square(f * 0.5) * 0.25;
    const shimmer = Math.sin(t * 2 * Math.PI * f * 3) * 0.12 * expDecay(t, 0.05);
    const snap = click.process(noise()) * 0.55 * expDecay(t, 0.006);
    return softClip((lp.process(hp.process(core)) * ad(t, 0.002, 0.075) + shimmer + snap) * 1.4);
  }), 0.82);
}

/** Rocket launch: sub thump + rushing whoosh + metallic clank. */
function bazooka(): Float32Array {
  const sub = new Osc(); const noise = createNoise(23); const bp = new Biquad('bp', 1800, 1.1); const lp = new Biquad('lp', 5000, 0.7);
  const clank = new Osc(); const clankF = new Biquad('bp', 1700, 4);
  return finish(render(0.62, (t) => {
    const thump = sub.sine(150 * Math.exp(-t * 17) + 42) * expDecay(t, 0.1) * 1.0;
    bp.set(1900 * Math.exp(-t * 3.2) + 260, 1.2);
    const whoosh = bp.process(noise()) * ad(t, 0.035, 0.2) * 1.6;
    const metal = clankF.process(clank.square(930)) * expDecay(t, 0.012) * 0.9;
    return softClip(lp.process(thump + whoosh + metal) * 1.3);
  }), 0.9, 40);
}

/** Big explosion: crack, filtered body sweeping down, sub boom, rumble and a reverb tail. */
function explosion(): Float32Array {
  const noise = createNoise(37); const body = new Biquad('lp', 3500, 0.8); const rumble = new Biquad('lp', 160, 0.8); const sub = new Osc();
  const r = new Biquad('lp', 160, 0.8); void r;
  const dry = render(1.7, (t) => {
    const crack = noise() * expDecay(t, 0.012) * 0.85;
    body.set(3600 * Math.exp(-t * 2.9) + 90, 0.8);
    const b = body.process(noise()) * ad(t, 0.003, 0.4) * 1.4;
    const boom = sub.sine(84 * Math.exp(-t * 1.5) + 27) * ad(t, 0.004, 0.55) * 1.1;
    const rum = rumble.process(noise()) * ad(t, 0.02, 0.9) * 1.5;
    return softClip((crack + b + boom + rum) * 1.3);
  });
  return finish(reverb(dry, 0.3, 0.8), 0.95, 160);
}

const smooth = (a: number, b: number, t: number): number => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

interface EngineSpec {
  seconds: number;
  /** crankshaft speed in rpm (a two-stroke fires once per revolution) */
  rpm(t: number): number;
  /** 0..1: how much of the engine is audible (cord pull and sputters gate it) */
  gate(t: number): number;
  /** 0..1 chain/clutch rattle level */
  chain(t: number): number;
  /** 0..1 firing irregularity */
  rough(t: number): number;
  /** probability that a cylinder cycle misfires (sputtering) */
  misfire(t: number): number;
  seed: number;
}

/**
 * Two-stroke chainsaw engine: one exhaust "chuff" per revolution with cycle-to-cycle jitter, body + muffler resonances,
 * and the metallic rattle of the chain. Everything an engine does (idle, rev, load, sputter) is driven by the spec curves.
 */
function chainsawEngine(spec: EngineSpec): Float32Array {
  const noise = createNoise(spec.seed); const jit = createNoise(spec.seed + 7); const chainN = createNoise(spec.seed + 13);
  const hp = new Biquad('hp', 50, 0.7); const body = new Biquad('bp', 165, 1.1); const muff = new Biquad('bp', 780, 1.5); const buzz = new Biquad('bp', 1700, 1.2);
  const chainBp = new Biquad('bp', 3400, 0.8); const chainHp = new Biquad('hp', 1500, 0.7);
  let phase = 0; let amp = 1; let fScale = 1; let fired = true;
  return render(spec.seconds, (t) => {
    const f = (spec.rpm(t) / 60) * fScale;
    phase += f / SR;
    if (phase >= 1) {
      phase -= 1;
      const r = spec.rough(t);
      fScale = 1 + 0.06 * r * jit();
      fired = jit() * 0.5 + 0.5 >= spec.misfire(t);
      amp = fired ? 0.72 + 0.28 * Math.abs(jit()) : 0.12;
    }
    // exhaust chuff: sharp rise, fast decay, a softer second bump (port timing)
    const chuff = Math.pow(1 - phase, 5) * Math.min(1, phase / 0.012) + 0.28 * Math.pow(Math.max(0, 0.5 - Math.abs(phase - 0.38) * 3), 2) * 4;
    const src = hp.process(chuff * amp);
    const engine = body.process(src) * 2.6 + muff.process(src) * 1.5 + buzz.process(src) * 0.8 + src * 0.5;
    // chain rattle: bright noise amplitude-modulated at the tooth rate
    const tooth = 0.5 + 0.5 * Math.sin(2 * Math.PI * f * 4.3 * t);
    const rattle = chainHp.process(chainBp.process(chainN())) * (0.35 + 0.65 * tooth) * spec.chain(t) * 1.9;
    // a little blow-by hiss that follows the load
    const hiss = noise() * 0.05 * spec.chain(t);
    return softClip((engine * spec.gate(t) + rattle * spec.gate(t) + hiss) * 0.9);
  });
}

/** Cord pull: the starter's ratcheting rip - a train of sharp ticks with a rasping body that speeds up. */
function cordPull(seconds: number, seed: number): Float32Array {
  const n = createNoise(seed); const bp = new Biquad('bp', 2600, 1.1); const tick = new Biquad('hp', 1800, 0.7); const low = new Biquad('lp', 400, 0.7);
  const o = new Osc();
  return render(seconds, (t) => {
    const k = t / seconds;
    const rate = 24 + 70 * k; // ratchet teeth per second, accelerating
    const ph = (t * rate) % 1;
    const click = tick.process(n()) * Math.exp(-ph * 22) * (0.5 + 0.5 * k);
    const rasp = bp.process(n()) * (0.35 + 0.65 * Math.abs(Math.sin(Math.PI * t * rate))) * 0.55;
    const rope = low.process(o.saw(95 + 140 * k)) * 0.22; // the pull itself (kept light: the ratchet is the bright part)
    return (click * 1.3 + rasp + rope) * smooth(0, 0.03, t) * (1 - smooth(seconds - 0.05, seconds, t));
  });
}

/** Melee saw cutting: full-throttle rev, bite under load (lower, rougher, crackling), then throttle off. */
function saw(): Float32Array {
  const n = createNoise(131); const crackle = new Biquad('bp', 1900, 1.8); const eng = chainsawEngine({
    seconds: 0.66, seed: 5,
    rpm: (t) => {
      const rev = 2800 + 2100 * smooth(0, 0.1, t); // blip the throttle
      const bite = 1 - 0.16 * smooth(0.12, 0.2, t) * (1 - smooth(0.46, 0.56, t)); // load drops the revs
      const wobble = 1 + 0.025 * Math.sin(2 * Math.PI * 17 * t) * smooth(0.12, 0.2, t);
      const off = 1 - 0.34 * smooth(0.5, 0.66, t); // throttle released
      return rev * bite * wobble * off;
    },
    gate: (t) => smooth(0, 0.015, t) * (1 - smooth(0.58, 0.66, t)),
    chain: (t) => 0.5 + 0.7 * smooth(0.1, 0.18, t) * (1 - smooth(0.5, 0.58, t)),
    rough: (t) => 0.25 + 0.6 * smooth(0.12, 0.2, t) * (1 - smooth(0.5, 0.58, t)),
    misfire: () => 0,
  });
  const out = eng;
  // wood-chip crackle while the teeth are in the cut
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (t > 0.13 && t < 0.52 && n() > 0.985) {
      const burst = Math.min(out.length - i, 400);
      for (let j = 0; j < burst; j++) out[i + j]! += crackle.process(n()) * Math.exp(-j / 70) * 0.22;
    }
  }
  return finish(out, 0.85, 60);
}

/** Switching to the saw: pull the cord, sputter, catch with a rev, settle into a rough idle. */
function spinup(): Float32Array {
  const T = 1.5; const pullLen = 0.3;
  const pull = cordPull(pullLen, 151);
  const eng = chainsawEngine({
    seconds: T, seed: 21,
    rpm: (t) => {
      if (t < 0.34) return 600 + 500 * smooth(0.3, 0.34, t);
      if (t < 0.7) return 950 + 380 * Math.sin(8 * t) + 220 * smooth(0.55, 0.7, t); // coughing, hunting speed
      const rev = 1300 + 2300 * smooth(0.7, 1.0, t); // catches and revs up
      return t < 1.0 ? rev : 3600 - 950 * smooth(1.0, 1.3, t); // settles to idle
    },
    gate: (t) => smooth(0.29, 0.36, t) * (1 - smooth(1.4, 1.5, t)),
    chain: (t) => 0.06 + 0.5 * smooth(0.68, 1.0, t) * (1 - 0.5 * smooth(1.0, 1.3, t)),
    rough: (t) => (t < 0.7 ? 0.9 : 0.5 - 0.3 * smooth(1.0, 1.4, t)),
    misfire: (t) => (t < 0.7 ? 0.5 : 0),
  });
  mixPull(eng, pull);
  return finish(eng, 0.85, 80);
}

function mixPull(dst: Float32Array, pull: Float32Array): void {
  for (let i = 0; i < pull.length && i < dst.length; i++) dst[i]! += pull[i]! * 0.55;
}

/** Pickup: a soft two-note chime. */
function pickup(): Float32Array {
  const notes = [{ f: 880, at: 0, tau: 0.09 }, { f: 1318.5, at: 0.085, tau: 0.13 }];
  const oscs = notes.map(() => [new Osc(), new Osc(), new Osc()]);
  return finish(render(0.45, (t) => {
    let s = 0;
    notes.forEach((n, i) => {
      const lt = t - n.at;
      if (lt < 0) return;
      const [a, b, c] = oscs[i]!;
      s += (a!.sine(n.f) * 0.6 + b!.tri(n.f) * 0.18 + c!.sine(n.f * 2.0) * 0.22) * ad(lt, 0.003, n.tau);
    });
    return s;
  }), 0.7, 40);
}

/** Respawn: an energy sweep that resolves into sparkling chimes. */
function respawn(): Float32Array {
  const sw = new Osc(); const sw2 = new Osc(); const noise = createNoise(67); const bp = new Biquad('bp', 800, 2);
  const chimes = [1568, 2093, 2637].map((f, i) => ({ f, at: 0.42 + i * 0.07, o: new Osc(), o2: new Osc() }));
  return finish(render(0.95, (t) => {
    const k = Math.min(1, t / 0.55);
    const f = 140 * Math.pow(17, k);
    bp.set(f * 1.3, 3);
    const sweep = (sw.sine(f) * 0.7 + sw2.tri(f * 1.01) * 0.25) * Math.min(1, t / 0.08) * (t < 0.55 ? 1 : expDecay(t - 0.55, 0.04));
    const air = bp.process(noise()) * 0.5 * (t < 0.55 ? Math.min(1, t / 0.1) : expDecay(t - 0.55, 0.06));
    let ch = 0;
    for (const c of chimes) { const lt = t - c.at; if (lt >= 0) ch += (c.o.sine(c.f) * 0.7 + c.o2.sine(c.f * 2.02) * 0.2) * ad(lt, 0.004, 0.16); }
    return sweep * 0.8 + air + ch * 0.55;
  }), 0.8, 90);
}

/** Player death: a falling synth cry plus a body thud. */
function die(): Float32Array {
  const o = new Osc(); const sub = new Osc(); const noise = createNoise(79); const lp = new Biquad('lp', 1800, 1.2); const hit = new Biquad('hp', 1500, 0.7);
  return finish(render(0.6, (t) => {
    const f = 320 * Math.exp(-t * 4.5) + 70;
    lp.set(1900 * Math.exp(-t * 4.5) + 260, 1.3);
    const cry = lp.process(o.saw(f) * 0.8 + o.square(f * 0.5) * 0.0) * ad(t, 0.004, 0.17);
    const thud = sub.sine(95 * Math.exp(-t * 9) + 38) * ad(t, 0.003, 0.14) * 0.9;
    const snap = hit.process(noise()) * expDecay(t, 0.012) * 0.5;
    return softClip((cry * 1.1 + thud + snap) * 1.3);
  }), 0.82, 60);
}

/** Gib: a heavy wet burst with crackling grains and a deep drop. */
function diehard(): Float32Array {
  const noise = createNoise(97); const body = new Biquad('lp', 2800, 0.9); const sub = new Osc(); const o = new Osc(); const gnoise = createNoise(101);
  const grains = Array.from({ length: 7 }, (_, i) => ({ at: 0.05 + i * 0.07 + Math.abs(gnoise()) * 0.04, amp: 0.25 + Math.abs(gnoise()) * 0.3 }));
  const gf = new Biquad('bp', 2200, 2);
  return finish(render(0.85, (t) => {
    body.set(2900 * Math.exp(-t * 4.2) + 140, 0.9);
    const burst = body.process(noise()) * ad(t, 0.003, 0.2) * 1.3;
    const drop = sub.sine(110 * Math.exp(-t * 3.2) + 30) * ad(t, 0.004, 0.32) * 1.0;
    const fall = o.saw(240 * Math.exp(-t * 5) + 50) * ad(t, 0.004, 0.14) * 0.3;
    let g = 0;
    for (const gr of grains) { const lt = t - gr.at; if (lt >= 0 && lt < 0.03) g += gf.process(noise()) * gr.amp * expDecay(lt, 0.008); }
    return softClip((burst + drop + fall + g) * 1.4);
  }), 0.95, 110);
}

/** Flag alarm: an urgent hi-lo siren with a little echo. */
function alarm(): Float32Array {
  const o = new Osc(); const o2 = new Osc(); const lp = new Biquad('lp', 1500, 0.9);
  const dry = render(1.3, (t) => {
    const step = Math.floor(t / 0.16);
    const f = step % 2 === 0 ? 880 : 660;
    const lt = t - step * 0.16;
    const tone = lp.process(o.saw(f) * 0.7 + o2.square(f * 1.5) * 0.18);
    return tone * ad(lt, 0.006, 0.12) * (t < 1.16 ? 1 : expDecay(t - 1.16, 0.03));
  });
  return finish(echo(dry, 0.13, 0.32), 0.72, 80);
}

/** Capture: a bright rising bell arpeggio resolving into a major chord. */
function capture(): Float32Array {
  const arp = [523.25, 659.25, 783.99, 1046.5];
  const chord = [523.25, 659.25, 783.99, 1046.5];
  const mk = () => [new Osc(), new Osc(), new Osc(), new Osc(), new Osc()] as const;
  const arpO = arp.map(mk); const chordO = chord.map(mk);
  // bell = fundamental + inharmonic upper partials (the quick-fading ones are the metallic "ting")
  const bell = (o: ReturnType<typeof mk>, f: number, lt: number, tau: number) =>
    (o[0].sine(f) * 0.7 + o[1].sine(f * 2.01) * 0.28 + o[2].sine(f * 3.02) * 0.1
      + o[3].sine(f * 4.17) * 0.09 * expDecay(lt, 0.09) + o[4].sine(f * 5.43) * 0.06 * expDecay(lt, 0.06)) * ad(lt, 0.003, tau);
  const dry = render(1.4, (t) => {
    let s = 0;
    arp.forEach((f, i) => { const lt = t - i * 0.095; if (lt >= 0) s += bell(arpO[i]!, f, lt, 0.3) * 0.7; });
    const ct = t - 0.42;
    if (ct >= 0) chord.forEach((f, i) => { s += bell(chordO[i]!, f, ct, 0.5) * 0.5; });
    return s;
  });
  return finish(reverb(dry, 0.18, 0.78), 0.8, 150);
}

/** Command to the ally: a soft, round two-note "comms" blip (a gentle static tick, low C5 -> G5, warm tone) - calm, not the bright loot chime. */
function order(): Float32Array {
  const noise = createNoise(113); const tick = new Biquad('bp', 2400, 1.4); const lp = new Biquad('lp', 2600, 0.7);
  const notes = [{ f: 523.25, at: 0, tau: 0.07 }, { f: 783.99, at: 0.095, tau: 0.11 }];
  const oscs = notes.map(() => [new Osc(), new Osc()] as const);
  return finish(render(0.36, (t) => {
    let s = tick.process(noise()) * expDecay(t, 0.004) * 0.18;
    notes.forEach((n, i) => {
      const lt = t - n.at;
      if (lt < 0) return;
      const [a, b] = oscs[i]!;
      s += (a.sine(n.f) * 0.75 + b.tri(n.f * 0.5) * 0.25) * ad(lt, 0.006, n.tau);
    });
    return lp.process(s);
  }), 0.55, 60);
}

/** One metallic strike: a sharp noise click, a low body thump and a ring made of inharmonic partials. */
function strike(t: number, at: number, noise: () => number, hpf: Biquad, rings: [number, number, number][], thumpHz: number, thump: number, click: number, rinos: Osc[], thumpOsc: Osc): number {
  const lt = t - at;
  if (lt < 0) return 0;
  let s = hpf.process(noise()) * expDecay(lt, 0.006) * click;
  s += thumpOsc.sine(thumpHz * Math.exp(-lt * 14) + thumpHz * 0.45) * expDecay(lt, 0.07) * thump;
  rings.forEach(([f, amp, tau], i) => { s += rinos[i]!.sine(f) * amp * expDecay(lt, tau); });
  return s;
}

/** Ammo pickup: one hard metallic clack of a magazine seating - a single hit, no tail. */
function ammo(): Float32Array {
  const noise = createNoise(171); const hpf = new Biquad('hp', 2400, 0.7); const body = new Biquad('lp', 5200, 0.7);
  const rings = [new Osc(), new Osc()]; const thump = new Osc();
  return finish(render(0.2, (t) => {
    const s = strike(t, 0.0, noise, hpf, [[1900, 0.2, 0.012], [1500, 0.14, 0.015]], 140, 0.8, 1.9, rings, thump);
    return softClip(body.process(s) * 1.4);
  }), 0.9, 25);
}

/** Weapon pickup: one heavy breech clack - a single, deeper hit than the ammo one. */
function weapon(): Float32Array {
  const noise = createNoise(181); const hpf = new Biquad('hp', 2000, 0.7); const body = new Biquad('lp', 4800, 0.7);
  const rings = [new Osc(), new Osc()]; const thump = new Osc();
  return finish(render(0.26, (t) => {
    const s = strike(t, 0.0, noise, hpf, [[520, 0.3, 0.04], [1340, 0.2, 0.025]], 90, 1.1, 1.6, rings, thump);
    return softClip(body.process(s) * 1.4);
  }), 0.95, 30);
}

const FACTORIES: Record<EffectName, () => Float32Array> = { laser, bazooka, explosion, saw, spinup, pickup, respawn, die, diehard, alarm, capture, order, ammo, weapon };
export const EFFECT_NAMES = Object.keys(FACTORIES) as EffectName[];
export const EFFECT_SAMPLE_RATE = SR;

/** Renders one effect (mono Float32 at 44.1 kHz). */
export const renderEffect = (name: EffectName): Float32Array => FACTORIES[name]();
