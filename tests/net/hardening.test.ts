import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../server/limits';
import { safeEqual } from '../../server/safe';
import { parseClientMessage } from '../../src/net/protocol';

const j = (o: unknown): string => JSON.stringify(o);

describe('parseClientMessage', () => {
  it('accepts every well-formed message of the protocol', () => {
    expect(parseClientMessage(j({ t: 'hello', name: 'A', create: true, initData: 'x=1' }))).toEqual({ t: 'hello', name: 'A', create: true, initData: 'x=1' });
    expect(parseClientMessage(j({ t: 'hello', name: 'A', create: false }))).toEqual({ t: 'hello', name: 'A', create: false });
    expect(parseClientMessage(j({ t: 'in', c: 0x124, ws: 2, wd: -1, at: 17 }))).toEqual({ t: 'in', c: 0x124, ws: 2, wd: -1, at: 17 });
    expect(parseClientMessage(j({ t: 'in', c: 0, ws: -1, wd: 0 }))).toEqual({ t: 'in', c: 0, ws: -1, wd: 0 });
    expect(parseClientMessage(j({ t: 'color', color: 3 }))).toEqual({ t: 'color', color: 3 });
    expect(parseClientMessage(j({ t: 'team', team: 1 }))).toEqual({ t: 'team', team: 1 });
    expect(parseClientMessage(j({ t: 'ping', ts: 123.5 }))).toEqual({ t: 'ping', ts: 123.5 });
    expect(parseClientMessage(j({ t: 'start' }))).toEqual({ t: 'start' });
    expect(parseClientMessage(j({ t: 'over' }))).toEqual({ t: 'over' });
    expect(parseClientMessage(j({ t: 'cfg', cfg: { mode: 'ctf' } }))).toEqual({ t: 'cfg', cfg: { mode: 'ctf' } });
    expect(parseClientMessage(j({ t: 'name', name: 'Bob' }))).toEqual({ t: 'name', name: 'Bob' });
  });

  it('rejects out-of-range or wrongly typed input fields (a modified client cannot poison the tick stream)', () => {
    const base = { t: 'in', c: 0, ws: -1, wd: 0 };
    for (const bad of [
      { ...base, ws: 7 }, { ...base, ws: '1' }, { ...base, ws: 1.5 }, { ...base, ws: null },
      { ...base, wd: 2 }, { ...base, wd: -2 }, { ...base, wd: 'x' },
      { ...base, c: -1 }, { ...base, c: 0x10000 }, { ...base, c: 1.5 }, { ...base, c: '4' }, { ...base, c: NaN },
      { ...base, at: 'now' }, { ...base, at: null },
      { t: 'in' },
    ]) expect(parseClientMessage(j(bad))).toBeNull();
    expect(parseClientMessage('{"t":"in","c":0,"ws":-1,"wd":0,"at":1e999}')).toBeNull(); // Infinity
  });

  it('rejects malformed, oversize and unknown messages', () => {
    for (const bad of ['', 'not json', '[]', 'null', '42', '"hello"', j({ t: 'nope' }), j({}), j({ t: 'color', color: 4 }), j({ t: 'color', color: 1.2 }),
      j({ t: 'team', team: 2 }), j({ t: 'team', team: '1' }), j({ t: 'ping', ts: 'x' }), j({ t: 'cfg', cfg: [] }), j({ t: 'cfg', cfg: null }),
      j({ t: 'hello', name: 5, create: true }), j({ t: 'hello', name: 'A', create: 'yes' }), j({ t: 'hello', name: 'A', create: true, initData: 9 }),
      j({ t: 'name', name: 7 })]) expect(parseClientMessage(bad)).toBeNull();
    expect(parseClientMessage(undefined)).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(4))).toBeNull(); // binary frames are not part of the protocol
    expect(parseClientMessage(j({ t: 'name', name: 'x'.repeat(600) }))).toBeNull(); // small messages stay small
    expect(parseClientMessage(j({ t: 'hello', name: 'A', create: true, initData: 'y'.repeat(5000) }))).toBeNull();
    expect(parseClientMessage(j({ t: 'hello', name: 'A', create: true, initData: 'y'.repeat(2500) }))).not.toBeNull(); // real initData fits
  });
});

describe('RateLimiter', () => {
  it('lets a burst through up to the limit, then refuses until the window moves on', () => {
    const r = new RateLimiter(3, 1000);
    expect([r.allow(0), r.allow(10), r.allow(20), r.allow(30)]).toEqual([true, true, true, false]);
    expect(r.allow(999)).toBe(false);
    expect(r.allow(1005)).toBe(true); // the first hit has aged out
    expect(r.allow(1006)).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares strings exactly, including different lengths and unicode', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'secreT')).toBe(false);
    expect(safeEqual('secret', 'secre')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('', 'a')).toBe(false);
    expect(safeEqual('пароль', 'пароль')).toBe(true);
    expect(safeEqual('пароль', 'парола')).toBe(false);
  });
});
