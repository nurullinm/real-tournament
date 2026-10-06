import { Biquad, Osc, SR, ad, createNoise, declick, echo, expDecay, lerp, normalize, render, reverb, softClip } from './dsp';

/** Sound effects, synthesised at 44.1 kHz. Modern sci-fi flavour: layered tones + filtered noise + sub bass. */
export type EffectName =
  | 'laser' | 'bazooka' | 'explosion' | 'saw' | 'spinup' | 'pickup' | 'respawn' | 'die' | 'diehard' | 'alarm' | 'capture' | 'order';

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

/** Melee saw: a growling, vibrating motor with grit. */
function saw(): Float32Array {
  const o = new Osc(); const o2 = new Osc(); const noise = createNoise(41); const bp = new Biquad('bp', 1100, 1.8); const grit = new Biquad('bp', 2800, 1.5);
  return finish(render(0.6, (t) => {
    const f = 78 + 7 * Math.sin(2 * Math.PI * 11 * t);
    const motor = o.saw(f) * 0.7 + o2.square(f * 2.01) * 0.3;
    const am = 1 + 0.55 * Math.sin(2 * Math.PI * 34 * t);
    const body = bp.process(motor) * 2.2 + motor * 0.35 + grit.process(noise()) * 0.3;
    const env = Math.min(1, t / 0.02) * Math.min(1, (0.6 - t) / 0.12);
    return softClip(body * am * env * 1.6);
  }), 0.8, 60);
}

/** Switching to the saw: a rising whine. */
function spinup(): Float32Array {
  const o = new Osc(); const noise = createNoise(53); const lp = new Biquad('lp', 2000, 0.9);
  return finish(render(0.62, (t) => {
    const k = Math.min(1, t / 0.5);
    const f = 62 * Math.pow(7, k);
    lp.set(600 + 3500 * k, 1.0);
    const env = Math.min(1, t / 0.05) * Math.min(1, (0.62 - t) / 0.1) * (0.4 + 0.6 * k);
    return softClip(lp.process(o.saw(f) * 0.8 + noise() * 0.12) * env * 1.5);
  }), 0.72, 60);
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

const FACTORIES: Record<EffectName, () => Float32Array> = { laser, bazooka, explosion, saw, spinup, pickup, respawn, die, diehard, alarm, capture, order };
export const EFFECT_NAMES = Object.keys(FACTORIES) as EffectName[];
export const EFFECT_SAMPLE_RATE = SR;

/** Renders one effect (mono Float32 at 44.1 kHz). */
export const renderEffect = (name: EffectName): Float32Array => FACTORIES[name]();
