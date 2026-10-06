import { describe, expect, it } from 'vitest';
import { cycle, defaultSettings, loadSettings, sanitizeSettings, saveSettings, toMatchOptions } from '../../src/ui/settings';

const memStore = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, m };
};

describe('settings', () => {
  it('defaults match the original option table', () => {
    const s = defaultSettings();
    expect(s.violence).toBe(true);
    expect(s.dm.skill).toBe(2);
    expect(s.dm.bots).toBe(1);
    expect(s.ctf.team).toBe(true);
  });

  it('round-trips through storage', () => {
    const store = memStore();
    const s = defaultSettings();
    s.dm.map = 4;
    s.sound = false;
    saveSettings(s, store);
    expect(loadSettings(store)).toEqual(s);
  });

  it('survives corrupt or hostile stored data', () => {
    expect(loadSettings(memStore({ 'rt-settings-v1': '{not json' }))).toEqual(defaultSettings());
    const s = sanitizeSettings({ sound: 'yes', dm: { map: 99, skill: -4, bots: 1.5, color: 'x' }, ctf: { map: 3, flagLimit: 1000 } });
    expect(s.sound).toBe(true);
    expect(s.dm.map).toBe(6);
    expect(s.dm.skill).toBe(0);
    expect(s.dm.bots).toBe(1);
    expect(s.ctf.map).toBe(3);
    expect(s.ctf.flagLimit).toBe(9);
  });

  it('works when storage is unavailable or throws', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(defaultSettings());
    expect(() => saveSettings(defaultSettings(), throwing)).not.toThrow();
  });

  it('cycles with wrap-around', () => {
    expect(cycle(0, -1, 5)).toBe(4);
    expect(cycle(4, 1, 5)).toBe(0);
    expect(cycle(2, 1, 5)).toBe(3);
  });

  it('maps menu choices to match options (CTF maps start at 7, frag step is x5)', () => {
    const s = defaultSettings();
    s.dm.fragStep = 3;
    s.dm.bots = 3;
    s.ctf.map = 2;
    s.ctf.flagLimit = 4;
    const dm = toMatchOptions(s, 'dm');
    expect(dm).toMatchObject({ mode: 'dm', mapId: 0, fragLimit: 15, bots: 3 });
    const ctf = toMatchOptions(s, 'ctf');
    expect(ctf).toMatchObject({ mode: 'ctf', mapId: 9, fragLimit: 4, team: true });
  });
});
