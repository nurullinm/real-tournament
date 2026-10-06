import type { GameMap } from '../../src/assets/types';
import { setX, setY } from '../../src/engine/fighter';
import type { Fighter, Match, MatchOptions } from '../../src/engine/types';
import { buildBaseMatch } from '../../src/engine/world';

/** '#' = solid tile (id 1), '.' = empty (id 0). */
export function makeMap(rows: string[], extra: Partial<GameMap> = {}): GameMap {
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles = new Uint8Array(width * height);
  rows.forEach((r, y) => [...r].forEach((c, x) => { tiles[y * width + x] = c === '#' ? 1 : 0; }));
  return {
    id: 99, width, height, tiles, pobjs: [], nodes: [], dmBlue: [], dmRed: [],
    tram: { x1: 0, x2: 0, y: 0 }, cycle: null, docksLeft: [], docksRight: [], ...extra,
  };
}

export const TEST_ASSETS = {
  passable: [true, ...new Array<boolean>(63).fill(false)],
  muzzleX: new Array<number>(191).fill(8),
  muzzleY: new Array<number>(191).fill(-16),
};

export const BASE_OPTS: MatchOptions = {
  mapId: 99, mode: 'dm', skill: 2, bots: 1, fragLimit: 10, noMedikits: false, violence: true, team: false, playerColor: 0,
};

/** 20x12 room: solid walls at columns 0 and 19, solid floor from row 10. */
export const ROOM = [
  '#..................#', '#..................#', '#..................#', '#..................#',
  '#..................#', '#..................#', '#..................#', '#..................#',
  '#..................#', '#..................#', '####################', '####################',
];

export function roomMatch(opts: Partial<MatchOptions> = {}, seed = 1): Match {
  return buildBaseMatch({ ...BASE_OPTS, ...opts }, makeMap(ROOM), seed, TEST_ASSETS);
}

export function place(f: Fighter, x: number, y: number, supported: boolean): void {
  setX(f, x);
  setY(f, y);
  f.hp = 100;
  f.hasSupport = supported;
}
