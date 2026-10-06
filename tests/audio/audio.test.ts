import { describe, expect, it, vi } from 'vitest';
import { createAudio, type AudioContextLike } from '../../src/audio/audio';
import { eventVolume } from '../../src/audio/spatial';

function fakeContext() {
  const started: { loop: boolean; vol?: number }[] = [];
  let gainNode: { gain: { value: number }; connect(n: unknown): void } | null = null;
  const ctx: AudioContextLike = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({ decoded: true })),
    createBufferSource: () => {
      const s = { buffer: null as unknown, loop: false, onended: null as (() => void) | null, connect() {}, start() { started.push({ loop: s.loop, vol: gainNode?.gain.value }); }, stop: vi.fn() };
      return s;
    },
    createGain: () => (gainNode = { gain: { value: 1 }, connect() {} }),
    createOscillator: () => ({ type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
  };
  return { ctx, started };
}

function make() {
  const f = fakeContext();
  let t = 0;
  const audio = createAudio('audio/', { createContext: () => f.ctx, fetchBytes: async () => new ArrayBuffer(8), now: () => (t += 1000) });
  return { audio, ...f };
}

describe('audio', () => {
  it('makes no sound before unlock()', () => {
    const { audio, started } = make();
    audio.play('laser');
    expect(started).toHaveLength(0);
  });

  it('plays after unlock()', async () => {
    const { audio, started, ctx } = make();
    await audio.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    audio.play('laser');
    expect(started).toHaveLength(1);
  });

  it('setEnabled(false) suppresses effects and music', async () => {
    const { audio, started } = make();
    await audio.unlock();
    audio.music(true);
    expect(started.some((s) => s.loop)).toBe(true);
    const before = started.length;
    audio.setEnabled(false);
    audio.play('laser');
    audio.play('explosion');
    expect(started).toHaveLength(before);
  });

  it('suspend() suspends the context and mutes until resume()', async () => {
    const { audio, ctx, started } = make();
    await audio.unlock();
    audio.suspend();
    expect(ctx.suspend).toHaveBeenCalled();
    audio.play('laser');
    expect(started).toHaveLength(0);
    audio.resume();
    audio.play('laser');
    expect(started).toHaveLength(1);
  });

  it('rate-limits a repeating effect', async () => {
    const f = fakeContext();
    const audio = createAudio('audio/', { createContext: () => f.ctx, fetchBytes: async () => new ArrayBuffer(8), now: () => 5000 });
    await audio.unlock();
    audio.play('laser');
    audio.play('laser');
    expect(f.started).toHaveLength(1);
  });

  it('survives a file that cannot be decoded', async () => {
    const f = fakeContext();
    f.ctx.decodeAudioData = vi.fn(async () => { throw new Error('bad'); });
    const audio = createAudio('audio/', { createContext: () => f.ctx, fetchBytes: async () => new ArrayBuffer(1), now: () => 1 });
    await expect(audio.unlock()).resolves.toBeUndefined();
    audio.play('laser');
    expect(f.started).toHaveLength(0);
  });

  it('applies the requested volume', async () => {
    const { audio, started } = make();
    await audio.unlock();
    audio.play('explosion', 0.4);
    expect(started.at(-1)!.vol).toBe(0.4);
  });
});

describe('eventVolume', () => {
  it('is loud nearby and quieter far away but never silent', () => {
    expect(eventVolume(100, 100, 100, 100)).toBe(1);
    expect(eventVolume(100, 100, 300, 100)).toBeLessThan(1);
    expect(eventVolume(0, 0, 5000, 0)).toBe(0.12);
  });
});
