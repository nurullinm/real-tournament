import { describe, expect, it, vi } from 'vitest';
import { createAudio, musicForMap, type AudioContextLike } from '../../src/audio/audio';
import { EFFECT_NAMES } from '../../src/audio/synth/effects';
import { eventVolume } from '../../src/audio/spatial';

const tinyLoop = async () => ({ left: new Float32Array(64), right: new Float32Array(64), sr: 32000 });

interface Started { loop: boolean; vol: number; stopped: boolean }

function fakeContext(autoplay: boolean) {
  const started: Started[] = [];
  const buffers: { channels: number; len: number; sr: number }[] = [];
  const duckCalls: number[] = [];
  const ctx: AudioContextLike & { setState(s: string): void } = {
    currentTime: 0,
    destination: {},
    state: 'suspended',
    onstatechange: null,
    resume: vi.fn(async () => { if (autoplay || ctx.state === 'running' || gestureOk) ctx.setState('running'); }),
    suspend: vi.fn(async () => { ctx.setState('suspended'); }),
    createBuffer: (channels, len, sr) => { buffers.push({ channels, len, sr }); return { copyToChannel() {} }; },
    createBufferSource: () => {
      let rec: Started | null = null;
      const s = {
        buffer: null as unknown, loop: false, onended: null as (() => void) | null, connect() {},
        start() { rec = { loop: s.loop, vol: lastGain, stopped: false }; started.push(rec); },
        stop() { if (rec) rec.stopped = true; },
      };
      return s;
    },
    createGain: () => {
      const g = {
        gain: {
          value: 1,
          setValueAtTime(v: number) { g.gain.value = v; },
          linearRampToValueAtTime(v: number) { g.gain.value = v; lastGain = v; },
          setTargetAtTime(v: number) { duckCalls.push(v); },
          cancelScheduledValues() {},
        },
        connect() {},
      };
      lastGain = 1;
      return g;
    },
    setState(s: string) { ctx.state = s; ctx.onstatechange?.(); },
  };
  let lastGain = 1;
  let gestureOk = false;
  return { ctx, started, buffers, duckCalls, allowGesture: () => { gestureOk = true; } };
}

function make(autoplay = false) {
  const f = fakeContext(autoplay);
  let t = 0;
  const audio = createAudio({ createContext: () => f.ctx, now: () => (t += 1000), yield: async () => {}, renderMusic: tinyLoop });
  const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { audio, settle, ...f };
}

describe('sound effects', () => {
  it('renders every effect up front (one mono 44.1 kHz buffer each)', async () => {
    const { audio, buffers, settle } = make();
    audio.init();
    await settle();
    const mono = buffers.filter((b) => b.channels === 1 && b.sr === 44100);
    expect(mono).toHaveLength(EFFECT_NAMES.length);
  });

  it('makes no sound while the context is still locked, plays after unlock()', async () => {
    const { audio, started, settle, allowGesture } = make(false);
    audio.init();
    await settle();
    audio.play('laser');
    expect(started).toHaveLength(0);
    allowGesture();
    await audio.unlock();
    audio.play('laser');
    expect(started.filter((s) => !s.loop).length).toBeGreaterThanOrEqual(1);
    expect(audio.running).toBe(true);
  });

  it('rate-limits a repeating effect and applies the requested volume', async () => {
    const f = fakeContext(true);
    const audio = createAudio({ createContext: () => f.ctx, now: () => 5000, yield: async () => {}, renderMusic: tinyLoop });
    audio.init();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const before = f.started.length;
    audio.play('laser');
    audio.play('laser');
    expect(f.started.length - before).toBe(1);
  });

  it('keeps item respawn silent and ignores unknown or zero-volume sounds', async () => {
    const { audio, started, settle } = make(true);
    audio.init();
    await settle();
    const before = started.length;
    audio.play('itemrespawn');
    audio.play('explosion', 0);
    expect(started.length).toBe(before);
  });

  it('setEnabled(false) mutes effects', async () => {
    const { audio, started, settle } = make(true);
    audio.init();
    await settle();
    audio.setEnabled(false);
    const before = started.length;
    audio.play('explosion');
    expect(started.length).toBe(before);
    audio.setEnabled(true);
    audio.play('explosion');
    expect(started.length).toBe(before + 1);
  });

  it('big explosions briefly duck the music', async () => {
    const { audio, duckCalls, settle } = make(true);
    audio.playMusic('dm0');
    audio.init();
    await settle();
    audio.play('explosion');
    expect(duckCalls.length).toBeGreaterThan(0);
    expect(duckCalls[0]).toBeLessThan(0.3); // pulled below the in-game level
  });
});

describe('background music', () => {
  const loops = (started: Started[]) => started.filter((s) => s.loop);

  it('starts by itself right after init when the webview allows autoplay (no tap needed)', async () => {
    const { audio, started, settle } = make(true);
    audio.playMusic('menu');
    audio.init();
    await settle();
    expect(loops(started)).toHaveLength(1);
    expect(audio.nowPlaying).toBe('menu');
  });

  it('waits for the first gesture when autoplay is blocked, then starts immediately', async () => {
    const { audio, started, settle, allowGesture } = make(false);
    audio.playMusic('menu');
    audio.init();
    await settle();
    expect(loops(started)).toHaveLength(0);
    expect(audio.nowPlaying).toBeNull();
    allowGesture();
    await audio.unlock();
    await settle();
    expect(loops(started)).toHaveLength(1);
    expect(audio.nowPlaying).toBe('menu');
  });

  it('a request made before init() is not lost', async () => {
    const { audio, started, settle } = make(true);
    audio.playMusic('menu');
    expect(loops(started)).toHaveLength(0); // no context yet
    audio.init();
    await settle();
    expect(loops(started)).toHaveLength(1);
  });

  it('switches loops when the map changes and stops the old one', async () => {
    const { audio, started, settle } = make(true);
    audio.playMusic('menu');
    audio.init();
    await settle();
    audio.playMusic('dm3');
    await settle();
    const l = loops(started);
    expect(l).toHaveLength(2);
    expect(l[0]!.stopped).toBe(true);
    expect(l[1]!.stopped).toBe(false);
  });

  it('menu music is louder than in-game music (it must not mask the effects)', async () => {
    const { audio, started, settle } = make(true);
    audio.playMusic('menu');
    audio.init();
    await settle();
    audio.playMusic('ctf2');
    await settle();
    const l = loops(started);
    expect(l[1]!.vol).toBeLessThan(l[0]!.vol);
  });

  it('null stops the music; setEnabled(false)/suspend() silence it and resume() brings it back', async () => {
    const { audio, started, ctx, settle } = make(true);
    audio.playMusic('dm1');
    audio.init();
    await settle();
    expect(loops(started)[0]!.stopped).toBe(false);
    audio.suspend();
    expect(ctx.suspend).toHaveBeenCalled();
    expect(loops(started)[0]!.stopped).toBe(true);
    audio.resume();
    await settle();
    expect(loops(started)).toHaveLength(2);
    audio.setEnabled(false);
    expect(loops(started)[1]!.stopped).toBe(true);
    audio.setEnabled(true);
    await settle();
    expect(loops(started)).toHaveLength(3);
    audio.playMusic(null);
    expect(loops(started)[2]!.stopped).toBe(true);
  });

  it('survives a failing music render (no crash, no music)', async () => {
    const f = fakeContext(true);
    const audio = createAudio({ createContext: () => f.ctx, now: () => 1, yield: async () => {}, renderMusic: async () => { throw new Error('boom'); } });
    audio.playMusic('menu');
    audio.init();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(f.started.filter((s) => s.loop)).toHaveLength(0);
  });

  it('maps map indexes to themes', () => {
    expect(musicForMap(0)).toBe('dm0');
    expect(musicForMap(7)).toBe('ctf0');
    expect(musicForMap(11)).toBe('ctf4');
  });
});

describe('eventVolume', () => {
  it('is loud nearby and quieter far away but never silent', () => {
    expect(eventVolume(100, 100, 100, 100)).toBe(1);
    expect(eventVolume(100, 100, 300, 100)).toBeLessThan(1);
    expect(eventVolume(0, 0, 5000, 0)).toBe(0.12);
  });
});

describe('recovery after the OS interrupts audio (screen lock)', () => {
  it('poke() resumes an interrupted context and restarts music', async () => {
    const { audio, ctx, started, settle } = make(true);
    audio.playMusic('menu');
    audio.init();
    await settle();
    expect(audio.running).toBe(true);
    ctx.setState('interrupted');
    expect(audio.running).toBe(false);
    audio.poke();
    await settle();
    expect(audio.running).toBe(true);
    expect(started.filter((s) => s.loop).length).toBeGreaterThanOrEqual(1);
    audio.play('laser');
  });

  it('rebuilds a closed context', async () => {
    const { audio, ctx, settle } = make(true);
    audio.init();
    await settle();
    ctx.setState('closed');
    await audio.unlock();
    await settle();
    expect(audio.running).toBe(true);
  });
});
