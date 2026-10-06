import type { LangPref } from '../i18n';
import type { MatchOptions } from '../engine/types';

/** Defaults and ranges follow the original's option table (opt_options). */
export interface GameSettings {
  language: LangPref;
  sound: boolean;
  violence: boolean;
  dm: { map: number; skill: number; bots: number; fragStep: number; color: number; noMedikits: boolean };
  ctf: { map: number; skill: number; team: boolean; flagLimit: number; color: number; noMedikits: boolean };
}

export const defaultSettings = (): GameSettings => ({
  language: 'auto',
  sound: true,
  violence: true,
  dm: { map: 0, skill: 2, bots: 1, fragStep: 0, color: 0, noMedikits: false },
  ctf: { map: 0, skill: 2, team: true, flagLimit: 0, color: 0, noMedikits: false },
});

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);

/** Validates untrusted stored data field by field; anything invalid falls back to the default. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, Record<string, unknown> | undefined> & { sound?: unknown; violence?: unknown; language?: unknown };
  const dm = r.dm ?? {};
  const ctf = r.ctf ?? {};
  return {
    language: r.language === 'en' || r.language === 'ru' || r.language === 'auto' ? r.language : d.language,
    sound: bool(r.sound, d.sound),
    violence: bool(r.violence, d.violence),
    dm: {
      map: clamp(dm.map, 0, 6, d.dm.map), skill: clamp(dm.skill, 0, 4, d.dm.skill), bots: clamp(dm.bots, 0, 3, d.dm.bots),
      fragStep: clamp(dm.fragStep, 0, 8, d.dm.fragStep), color: clamp(dm.color, 0, 3, d.dm.color), noMedikits: bool(dm.noMedikits, d.dm.noMedikits),
    },
    ctf: {
      map: clamp(ctf.map, 0, 4, d.ctf.map), skill: clamp(ctf.skill, 0, 4, d.ctf.skill), team: bool(ctf.team, d.ctf.team),
      flagLimit: clamp(ctf.flagLimit, 0, 9, d.ctf.flagLimit), color: clamp(ctf.color, 0, 1, d.ctf.color), noMedikits: bool(ctf.noMedikits, d.ctf.noMedikits),
    },
  };
}

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'rt-settings-v1';

/** Storage can be missing or throw (private mode, blocked site data): the game must work without it. */
export function loadSettings(store?: KeyValueStore): GameSettings {
  try {
    const s = store ?? globalThis.localStorage;
    const txt = s?.getItem(KEY);
    return txt ? sanitizeSettings(JSON.parse(txt)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: GameSettings, store?: KeyValueStore): void {
  try {
    (store ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Cycles an index through [0, count) in `dir` (wraps), like the original's left/right on a menu row. */
export const cycle = (v: number, dir: -1 | 1, count: number): number => (v + dir + count) % count;

export function toMatchOptions(s: GameSettings, mode: 'dm' | 'ctf'): MatchOptions {
  if (mode === 'dm') {
    const o = s.dm;
    return {
      mapId: o.map, mode: 'dm', skill: o.skill as MatchOptions['skill'], bots: o.bots, fragLimit: o.fragStep * 5,
      noMedikits: o.noMedikits, violence: s.violence, team: false, playerColor: o.color,
    };
  }
  const o = s.ctf;
  return {
    mapId: 7 + o.map, mode: 'ctf', skill: o.skill as MatchOptions['skill'], bots: 0, fragLimit: o.flagLimit,
    noMedikits: o.noMedikits, violence: s.violence, team: o.team, playerColor: o.color,
  };
}
