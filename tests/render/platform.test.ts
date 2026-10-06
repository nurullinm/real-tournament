import { describe, expect, it, vi } from 'vitest';
import { createPlatform, type PlatformEnv } from '../../src/platform/telegram';

const base = (over: Partial<PlatformEnv> = {}): PlatformEnv => ({
  innerWidth: 956, innerHeight: 440, addEventListener: () => {}, ...over,
});

describe('platform', () => {
  it('requests fullscreen as soon as the platform starts, on clients that support it', () => {
    const requestFullscreen = vi.fn();
    createPlatform(base({ Telegram: { WebApp: { ready() {}, requestFullscreen, isVersionAtLeast: () => true } } }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    const old = vi.fn();
    createPlatform(base({ Telegram: { WebApp: { ready() {}, requestFullscreen: old, isVersionAtLeast: () => false } } }));
    expect(old).not.toHaveBeenCalled();
  });
  it('lockLandscape resolves false when no orientation API exists', async () => {
    expect(await createPlatform(base()).lockLandscape()).toBe(false);
  });
  it('locks via Telegram when the phone is already landscape', async () => {
    const lockOrientation = vi.fn();
    const requestFullscreen = vi.fn();
    const p = createPlatform(base({ Telegram: { WebApp: { ready() {}, lockOrientation, requestFullscreen } } }));
    expect(p.isTelegram).toBe(true);
    expect(await p.lockLandscape()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalled();
    expect(lockOrientation).toHaveBeenCalled();
  });
  it('does not claim a lock while the phone is still in portrait', async () => {
    const lockOrientation = vi.fn();
    const p = createPlatform(base({ innerWidth: 440, innerHeight: 956, Telegram: { WebApp: { ready() {}, lockOrientation } } }));
    expect(p.isLandscape()).toBe(false);
    expect(await p.lockLandscape()).toBe(false);
    expect(lockOrientation).not.toHaveBeenCalled();
  });
  it('survives APIs that throw', async () => {
    const p = createPlatform(base({
      Telegram: { WebApp: { ready() {}, requestFullscreen() { throw new Error('nope'); } } },
      screen: { orientation: { lock: () => Promise.reject(new Error('NotSupported')) } },
    }));
    expect(await p.lockLandscape()).toBe(false);
  });
  it('reports background/foreground through visibility and Telegram events', () => {
    const handlers: Record<string, () => void> = {};
    const doc = { hidden: false, addEventListener: (t: string, cb: () => void) => { handlers[t] = cb; } };
    const tgHandlers: Record<string, () => void> = {};
    const p = createPlatform(base({
      document: doc,
      Telegram: { WebApp: { ready() {}, onEvent: (n: string, cb: () => void) => { tgHandlers[n] = cb; } } },
    }));
    const seen: boolean[] = [];
    p.onVisibility((v) => seen.push(v));
    doc.hidden = true;
    handlers.visibilitychange!();
    tgHandlers.activated!();
    tgHandlers.deactivated!();
    expect(seen).toEqual([false, true, false]);
  });
  it('sums safe-area insets', () => {
    const p = createPlatform(base({ Telegram: { WebApp: { ready() {}, safeAreaInset: { top: 0, bottom: 21, left: 47, right: 47 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 } } } }));
    expect(p.safeArea()).toEqual({ l: 47, r: 47, t: 0, b: 21 });
  });
});
