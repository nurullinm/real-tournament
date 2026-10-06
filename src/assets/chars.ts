import { Reader } from './binary';
import type { CharsData } from './types';

const toI8 = (v: number): number => (v << 24) >> 24;

/** Port of R_Init's `/chars` parsing. Sub-image 116 is remapped to 23 (weapon placeholder) like the original. */
export function parseChars(bytes: Uint8Array): CharsData {
  const r = new Reader(bytes);
  const n = r.i16();
  const subimages = [];
  for (let i = 0; i < n; i++) {
    subimages.push({ sheet: r.i8(), x: r.i16(), y: r.i16(), w: toI8(r.i16()), h: toI8(r.i16()) });
  }
  const nf = r.i16();
  const frameStart: number[] = [];
  for (let i = 0; i < nf; i++) frameStart.push(r.i16());
  const np = r.i16();
  const parts = [];
  for (let i = 0; i < np; i++) {
    let sub = r.i16();
    if (sub === 116) sub = 23;
    parts.push({ sub, x: toI8(r.i16()), y: toI8(r.i16()) });
  }
  return { subimages, frameStart, parts };
}
