import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { botName, colorName, ctfMapName, detectLang, dmMapName, getLang, onLangChange, orderLabel, orderShort, resolveLang, setLang, skillName, t, weaponName, type Key } from '../src/i18n';
import { defaultSettings, sanitizeSettings } from '../src/ui/settings';
import { createPlatform } from '../src/platform/telegram';

afterEach(() => setLang('en'));

const keys = Object.keys(en) as Key[];
const CYRILLIC = /[А-Яа-яЁё]/;
/** texts that are legitimately identical or Latin/numeric in Russian */
const SAME_IN_RU = new Set<Key>(['app.title', 'bots.1', 'bots.2', 'bots.3', 'lang.en', 'lang.ru']);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  it('Russian has every key, none empty', () => {
    expect(Object.keys(ru).sort()).toEqual([...keys].sort());
    for (const k of keys) expect(ru[k].trim().length, k).toBeGreaterThan(0);
  });

  it('every Russian text is really translated (contains Cyrillic) except the allowed names', () => {
    for (const k of keys) if (!SAME_IN_RU.has(k)) expect(CYRILLIC.test(ru[k]), `${k}: "${ru[k]}"`).toBe(true);
  });

  it('placeholders match between languages', () => {
    for (const k of keys) expect(placeholders(ru[k]), k).toEqual(placeholders(en[k]));
  });

  it('English texts are not accidentally Cyrillic (except the language name)', () => {
    for (const k of keys) if (k !== 'lang.ru') expect(CYRILLIC.test(en[k]), k).toBe(false);
  });

  it('numbered families are complete', () => {
    for (let i = 0; i < 5; i++) expect(en[`skill.${i}` as Key]).toBeTruthy();
    for (let i = 0; i < 4; i++) expect(en[`color.${i}` as Key] && en[`bots.${i}` as Key]).toBeTruthy();
    for (let i = 0; i < 7; i++) expect(en[`map.dm.${i}` as Key]).toBeTruthy();
    for (let i = 0; i < 5; i++) expect(en[`map.ctf.${i}` as Key]).toBeTruthy();
    for (let i = 0; i < 3; i++) expect(en[`order.${i}` as Key] && en[`order.short.${i}` as Key] && en[`hud.weapon.${i}` as Key]).toBeTruthy();
  });
});

describe('ally commands wording', () => {
  it('command labels carry no exclamation marks and the pause heading is "ally commands"', () => {
    for (const dict of [en, ru]) for (const k of ['order.0', 'order.1', 'order.2'] as const) expect(dict[k], k).not.toContain('!');
    expect(en['pause.ally']).toBe('Ally commands');
    expect(ru['pause.ally']).toBe('Команды союзникам');
  });
});

describe('language selection', () => {
  it('detects Russian from Telegram or browser hints, falls back to English', () => {
    expect(detectLang(['ru'])).toBe('ru');
    expect(detectLang(['ru-RU'])).toBe('ru');
    expect(detectLang([undefined, 'en-US', 'ru'])).toBe('en');
    expect(detectLang(['de', 'ru'])).toBe('ru'); // first RECOGNISED hint wins
    expect(detectLang(['de', 'fr'])).toBe('en');
    expect(detectLang([])).toBe('en');
    expect(detectLang([undefined, null, ''])).toBe('en');
  });

  it('an explicit choice beats the hints; auto follows them', () => {
    expect(resolveLang('en', ['ru'])).toBe('en');
    expect(resolveLang('ru', ['en'])).toBe('ru');
    expect(resolveLang('auto', ['ru'])).toBe('ru');
    expect(resolveLang('auto', [])).toBe('en');
  });

  it('t() translates, substitutes placeholders and notifies listeners once per change', () => {
    const seen = vi.fn();
    const off = onLangChange(seen);
    expect(t('menu.dm')).toBe('Deathmatch');
    setLang('ru');
    expect(getLang()).toBe('ru');
    expect(t('menu.dm')).toBe('Дэтматч');
    expect(t('hud.firstTo', { n: 5 })).toBe('ДО 5');
    setLang('ru');
    expect(seen).toHaveBeenCalledTimes(1);
    setLang('en');
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    setLang('ru');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('keeps unknown placeholders visible instead of dropping them', () => {
    expect(t('toast.ally', {})).toBe('Ally: {order}');
  });

  it('name helpers follow the language and clamp bad indexes', () => {
    setLang('ru');
    expect(skillName(2)).toBe('Средняя');
    expect(colorName(1)).toBe('Красный');
    expect(botName(0)).toBe('Нет');
    expect(dmMapName(0)).toBe('1. Два этажа');
    expect(ctfMapName(4)).toBe('5. Магистраль');
    expect(orderLabel(1)).toBe('Взять флаг');
    expect(orderShort(0)).toBe('ЗАЩИТА');
    expect(weaponName(2)).toBe('БАЗУКА');
    expect(skillName(99)).toBe('Очень сложная');
    expect(colorName(-3)).toBe('Синий');
  });
});

describe('language setting and platform hints', () => {
  it('defaults to auto and rejects invalid stored values', () => {
    expect(defaultSettings().language).toBe('auto');
    expect(sanitizeSettings({ language: 'ru' }).language).toBe('ru');
    expect(sanitizeSettings({ language: 'xx' }).language).toBe('auto');
    expect(sanitizeSettings({ language: 5 }).language).toBe('auto');
    expect(sanitizeSettings(null).language).toBe('auto');
  });

  it('platform hints: Telegram user language first, then the browser languages', () => {
    const p = createPlatform({
      innerWidth: 900, innerHeight: 400, addEventListener: () => {},
      Telegram: { WebApp: { ready() {}, initDataUnsafe: { user: { language_code: 'ru' } } } },
      navigator: { language: 'en-US', languages: ['en-US', 'de'] },
    });
    expect(p.languageHints()).toEqual(['ru', 'en-US', 'de', 'en-US']);
    const bare = createPlatform({ innerWidth: 900, innerHeight: 400, addEventListener: () => {} });
    expect(bare.languageHints()).toEqual([]);
  });
});
