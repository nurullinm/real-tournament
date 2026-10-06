import { Reader } from './binary';
import type { AiNode, Dock, GameMap, Pobj } from './types';

export const MAP_COUNT = 12;
/** Maps 0-6 are Deathmatch, 7-11 are Capture the flag. */
export const FIRST_CTF_MAP = 7;

export function parseMap(id: number, bytes: Uint8Array): GameMap {
  const r = new Reader(bytes);
  const width = r.i16();
  const height = r.i16();
  const tiles = new Uint8Array(width * height);
  for (let i = 0; i < tiles.length; i++) {
    const t = r.i8();
    tiles[i] = t < 0 ? 0 : t;
  }
  const pobjs: Pobj[] = [];
  const npobjs = r.i16();
  for (let i = 0; i < npobjs; i++) {
    const type = r.i8();
    const x = r.i16();
    const y = r.i16();
    let data1 = r.i16();
    if (type >= 2) data1 = y >> 4;
    pobjs.push({ type, x, y, data1 });
  }
  const nodes: AiNode[] = [];
  const nn = r.i16();
  for (let i = 0; i < nn; i++) {
    nodes.push({ type: r.i8(), x: r.i16(), y: r.i16(), left: r.i16(), right: r.i16(), top: r.i16(), flags: r.i8() });
  }
  const readList = (): number[] => {
    const n = r.i16();
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(r.i16());
    return out;
  };
  const dmBlue = readList();
  const dmRed = readList();
  const tram = { x1: r.i16(), x2: r.i16(), y: r.i16() };
  const cx1 = r.i16();
  const cy1 = r.i16();
  const cx2 = r.i16();
  const cy2 = r.i16();
  const nLeft = r.i16();
  const nRight = r.i16();
  const readDocks = (n: number): Dock[] => {
    const out: Dock[] = [];
    for (let i = 0; i < n; i++) out.push({ node: r.i16(), pobj: r.i16() });
    return out;
  };
  const docksLeft = readDocks(nLeft);
  const docksRight = readDocks(nRight);
  const hasCycle = nLeft + nRight > 0;
  return {
    id,
    width,
    height,
    tiles,
    pobjs,
    nodes,
    dmBlue,
    dmRed,
    tram,
    cycle: hasCycle ? { x1: cx1, y1: cy1 + 32, x2: cx2, y2: cy2 } : null,
    docksLeft,
    docksRight,
  };
}

export async function loadAllMaps(base = 'original/'): Promise<GameMap[]> {
  const out: GameMap[] = [];
  for (let i = 0; i < MAP_COUNT; i++) {
    const res = await fetch(`${base}${i}`);
    out.push(parseMap(i, new Uint8Array(await res.arrayBuffer())));
  }
  return out;
}

/** The `pass` file has 56 bytes (8x7 tiles); the original's 64-entry table leaves the rest false (solid). */
export function parsePassability(bytes: Uint8Array): boolean[] {
  const out = new Array<boolean>(64).fill(false);
  for (let i = 0; i < Math.min(64, bytes.length); i++) out[i] = bytes[i] === 0;
  return out;
}
