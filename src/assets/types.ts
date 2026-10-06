export interface Pobj {
  type: number;
  x: number;
  y: number;
  data1: number;
}

export interface AiNode {
  type: number;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  flags: number;
}

export interface Dock {
  node: number;
  pobj: number;
}

/** Layout and units follow docs/notes/map-format.md (positions in pixels, tile = 16 px). */
export interface GameMap {
  id: number;
  width: number;
  height: number;
  tiles: Uint8Array;
  pobjs: Pobj[];
  nodes: AiNode[];
  dmBlue: number[];
  dmRed: number[];
  tram: { x1: number; x2: number; y: number };
  /** null when the map has no cycles; y1 already includes the original's +32 adjustment */
  cycle: { x1: number; y1: number; x2: number; y2: number } | null;
  docksLeft: Dock[];
  docksRight: Dock[];
}

export interface SubImage {
  sheet: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharsData {
  subimages: SubImage[];
  frameStart: number[];
  /** `sub < 0` terminates a frame's part list */
  parts: { sub: number; x: number; y: number }[];
}
