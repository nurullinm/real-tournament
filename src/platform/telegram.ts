export interface SafeArea {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface Platform {
  isTelegram: boolean;
  /** Fullscreen + lock the current (landscape) orientation. true only when a lock call succeeded. */
  lockLandscape(): Promise<boolean>;
  isLandscape(): boolean;
  safeArea(): SafeArea;
  /** cb(true) when the app becomes visible/active, cb(false) when it goes to the background */
  onVisibility(cb: (visible: boolean) => void): void;
  onResize(cb: () => void): void;
  haptic(kind: 'light' | 'medium'): void;
  /** language hints in order of preference (Telegram user language, then the browser's) */
  languageHints(): string[];
}

interface TgWebApp {
  ready?(): void;
  expand?(): void;
  requestFullscreen?(): void;
  lockOrientation?(): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(v: string): boolean;
  onEvent?(name: string, cb: () => void): void;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  HapticFeedback?: { impactOccurred(style: string): void };
  initDataUnsafe?: { user?: { language_code?: string } };
}

/** The slice of `window` the platform layer touches (injectable for tests). */
export interface PlatformEnv {
  Telegram?: { WebApp?: TgWebApp };
  innerWidth: number;
  innerHeight: number;
  screen?: { orientation?: { lock?(o: string): Promise<void> } };
  navigator?: { language?: string; languages?: readonly string[] };
  document?: { hidden: boolean; addEventListener(t: string, cb: () => void): void };
  addEventListener(t: string, cb: () => void): void;
}

export function createPlatform(env: PlatformEnv): Platform {
  const tg = env.Telegram?.WebApp;
  const isTelegram = !!tg && typeof tg.ready === 'function';
  if (tg) {
    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
    // launch fullscreen right away (Bot API 8.0+); older clients keep the expanded view
    try {
      if (tg.requestFullscreen && (tg.isVersionAtLeast?.('8.0') ?? true)) tg.requestFullscreen();
    } catch {
      /* unsupported client */
    }
  }
  const isLandscape = (): boolean => env.innerWidth > env.innerHeight;
  return {
    isTelegram,
    isLandscape,
    async lockLandscape(): Promise<boolean> {
      let locked = false;
      try {
        if (tg?.requestFullscreen && (tg.isVersionAtLeast?.('8.0') ?? true)) {
          tg.requestFullscreen();
        }
        if (tg?.lockOrientation && isLandscape()) {
          tg.lockOrientation();
          locked = true;
        }
      } catch {
        /* unsupported client: handled by the rotate overlay */
      }
      try {
        const lock = env.screen?.orientation?.lock;
        if (lock) {
          await lock.call(env.screen!.orientation, 'landscape');
          locked = true;
        }
      } catch {
        /* iOS WebViews reject this */
      }
      return locked;
    },
    safeArea(): SafeArea {
      const a = tg?.safeAreaInset;
      const c = tg?.contentSafeAreaInset;
      return {
        l: (a?.left ?? 0) + (c?.left ?? 0),
        r: (a?.right ?? 0) + (c?.right ?? 0),
        t: (a?.top ?? 0) + (c?.top ?? 0),
        b: (a?.bottom ?? 0) + (c?.bottom ?? 0),
      };
    },
    onVisibility(cb): void {
      env.document?.addEventListener('visibilitychange', () => cb(!env.document!.hidden));
      tg?.onEvent?.('activated', () => cb(true));
      tg?.onEvent?.('deactivated', () => cb(false));
    },
    onResize(cb): void {
      env.addEventListener('resize', cb);
      env.addEventListener('orientationchange', cb);
      tg?.onEvent?.('viewportChanged', cb);
      tg?.onEvent?.('safeAreaChanged', cb);
      tg?.onEvent?.('contentSafeAreaChanged', cb);
      tg?.onEvent?.('fullscreenChanged', cb);
    },
    haptic(kind): void {
      tg?.HapticFeedback?.impactOccurred(kind);
    },
    languageHints(): string[] {
      const nav = env.navigator;
      return [tg?.initDataUnsafe?.user?.language_code, ...(nav?.languages ?? []), nav?.language].filter((x): x is string => !!x);
    },
  };
}

export async function initPlatform(): Promise<Platform> {
  return createPlatform(window as unknown as PlatformEnv);
}
