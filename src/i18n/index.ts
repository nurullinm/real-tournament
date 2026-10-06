import { en, type Key } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';
export type LangPref = 'auto' | Lang;
export type { Key };

const DICTS: Record<Lang, Record<Key, string>> = { en, ru };
let current: Lang = 'en';
const listeners = new Set<() => void>();

/** First recognised hint wins ("ru", "ru-RU", ...); anything else falls back to English. */
export function detectLang(hints: readonly (string | undefined | null)[]): Lang {
  for (const hint of hints) {
    const l = hint?.toLowerCase();
    if (!l) continue;
    if (l === 'ru' || l.startsWith('ru-') || l.startsWith('ru_')) return 'ru';
    if (l === 'en' || l.startsWith('en-') || l.startsWith('en_')) return 'en';
  }
  return 'en';
}

export function resolveLang(pref: LangPref, hints: readonly (string | undefined | null)[]): Lang {
  return pref === 'auto' ? detectLang(hints) : pref;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((cb) => cb());
}

export const getLang = (): Lang => current;

/** Called whenever the language changes (static labels re-render themselves here). */
export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Translate `key`, substituting `{name}` placeholders. A missing/empty RU string falls back to English. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const text = DICTS[current][key] || en[key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

const idx = (i: number, n: number): number => Math.min(Math.max(0, Math.trunc(i)), n);
export const skillName = (i: number): string => t(`skill.${idx(i, 4)}` as Key);
export const colorName = (i: number): string => t(`color.${idx(i, 3)}` as Key);
export const botName = (i: number): string => t(`bots.${idx(i, 3)}` as Key);
export const dmMapName = (i: number): string => t(`map.dm.${idx(i, 6)}` as Key);
export const ctfMapName = (i: number): string => t(`map.ctf.${idx(i, 4)}` as Key);
export const orderLabel = (i: number): string => t(`order.${idx(i, 2)}` as Key);
export const orderShort = (i: number): string => t(`order.short.${idx(i, 2)}` as Key);
export const weaponName = (i: number): string => t(`hud.weapon.${idx(i, 2)}` as Key);
