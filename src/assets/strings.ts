import { Reader } from './binary';

/** `.str` files: u16 count, then `count` Java modified-UTF strings (u16 length + bytes). */
export function parseStrings(bytes: Uint8Array): string[] {
  const r = new Reader(bytes);
  const n = r.u16();
  const dec = new TextDecoder('utf-8');
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(dec.decode(r.bytes(r.u16())));
  return out;
}
