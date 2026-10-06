import type { GameMap } from '../assets/types';
import { AI_JUMPINESS, AI_REACTION_PERCENT } from './constants';
import { createFighter } from './fighter';
import type { Match, MatchOptions, EngineAssets, PobjState, AiHooks } from './types';
import { createRng } from './rng';

/** Port of the cell-flag and reach tables computed in G_LoadMap. */
export function computeCells(map: GameMap, passable: boolean[]): { cell: Uint8Array[]; reachLeft: Uint8Array[]; reachRight: Uint8Array[] } {
  const nx = map.width;
  const ny = map.height;
  const cell = Array.from({ length: ny + 4 }, () => new Uint8Array(nx + 1));
  for (let y = 0; y < ny; y++) {
    const row = cell[y]!;
    for (let x = 0; x < nx; x++) {
      const t = map.tiles[y * nx + x]!;
      row[x] = passable[t] ? (y === 0 || (cell[y - 1]![x]! & 1) === 0 ? 0 : 2) : 3;
    }
    if (y >= 2) {
      const two = cell[y - 2]!;
      for (let x = 0; x < nx; x++) {
        if ((two[x]! & 2) !== 0) continue;
        if (x >= 2 && (row[x - 2]! & 1) !== 0) {
          row[x]! |= 4;
          if (x >= 3 && (row[x - 3]! & 1) === 0) row[x]! |= 0x10;
        }
        if (x >= nx - 2 || (row[x + 2]! & 1) === 0) continue;
        row[x]! |= 8;
        if (x >= nx - 3 || (row[x + 3]! & 1) !== 0) continue;
        row[x]! |= 0x20;
      }
    }
    row[0]! |= 2;
    row[nx - 1]! |= 2;
  }
  const reachLeft = Array.from({ length: ny + 4 }, () => new Uint8Array(nx + 1));
  const reachRight = Array.from({ length: ny + 4 }, () => new Uint8Array(nx + 1));
  for (let i = 0; i < ny + 4; i++) {
    const rl = reachLeft[i]!;
    const rr = reachRight[i]!;
    const c = cell[i]!;
    rl[0] = 0;
    for (let x = 1; x < nx; x++) rl[x] = (c[x]! & 1) === 0 ? rl[x - 1]! : x;
    rr[nx] = nx;
    for (let x = nx - 1; x >= 0; x--) rr[x] = (c[x]! & 1) === 0 ? rr[x + 1]! : x;
  }
  return { cell, reachLeft, reachRight };
}

const NO_AI: AiHooks = {
  catchGround() {}, findNearestNode() {}, makeDecision() {}, makeStrategicalDecision() {}, setCycleDestination() {},
  controlFighter: () => 0, controlCyclist: () => 0,
};

/** Port of the pickup/lift part of G_LoadMap. Mutates RNG exactly like the original (one bit per lift). */
function loadPobjs(map: GameMap, m: { rng: Match['rng'] }, noMedikits: boolean): { pobjs: PobjState[]; thinkers: number[] } {
  const pobjs: PobjState[] = map.pobjs.map((p) => ({ type: p.type, x: p.x, y: p.y, data1: p.data1, data2: 0, data3: 0 }));
  const thinkers: number[] = [];
  for (let n = 0; n < pobjs.length; n++) {
    const p = pobjs[n]!;
    if (p.type === 1) {
      if (m.rng.bits(1) === 0) {
        pobjs[n + 1]!.type = 16;
        p.y = pobjs[n + 1]!.y;
      } else {
        pobjs[n + 2]!.type = 16;
        p.y = pobjs[n + 2]!.y;
      }
      p.data2 = -1;
      p.data3 = 0;
      pobjs[n + 1]!.data2 = n + 2;
      pobjs[n + 1]!.data3 = n;
      pobjs[n + 2]!.data2 = n + 1;
      pobjs[n + 2]!.data3 = n;
      thinkers.push(n, n + 1, n + 2);
    } else if (p.type === 5 && noMedikits) {
      p.type |= 0x40;
    }
  }
  return { pobjs, thinkers };
}

/** Creates the world state and four idle fighters; mode-specific setup lives in createMatch (match.ts). */
export function buildBaseMatch(opts: MatchOptions, map: GameMap, seed: number, assets: EngineAssets): Match {
  const rng = createRng(seed);
  const { cell, reachLeft, reachRight } = computeCells(map, assets.passable);
  const { pobjs, thinkers } = loadPobjs(map, { rng }, opts.noMedikits);
  const tram = {
    x: rng.bits(1) === 0 ? map.tram.x1 : map.tram.x2,
    x1: map.tram.x1, x2: map.tram.x2, y: map.tram.y, speed: 1, state: 0, passenger: -1,
  };
  const cy = map.cycle;
  const cycle = cy
    ? {
        x1: cy.x1, y1: cy.y1, x2: cy.x2, y2: cy.y2,
        dockNodes: [...map.docksLeft, ...map.docksRight].map((d) => d.node),
        dockPobjs: [...map.docksLeft, ...map.docksRight].map((d) => d.pobj),
        leftNodes: map.docksLeft.map((d) => d.node),
        rightNodes: map.docksRight.map((d) => d.node),
      }
    : null;
  return {
    opts, map, assets, rng, ai: NO_AI,
    gameMode: opts.mode === 'dm' ? 0 : 1, tick: 0, events: [],
    ntilesx: map.width, ntilesy: map.height, mapWidth: map.width << 4, mapHeight: map.height << 4,
    cell, reachLeft, reachRight,
    fighters: [0, 1, 2, 3].map(createFighter), numFighters: 1, numSides: 1,
    score: [0, 0, 0, 0], sideColors: [0, 0, 0, 0], fragLimit: 0, lastDmStart: -1,
    skill: opts.skill, aiReaction: AI_REACTION_PERCENT[opts.skill], aiJumpiness: AI_JUMPINESS[opts.skill],
    pobjs, thinkers, respawnQueue: [], projectiles: [], rays: [], flagIsTaken: [false, false],
    tram, cycle,
  };
}

/** G_FindPoToTheLeft: index of the last pobj with x < `x` (pobjs are sorted by x), or -1. */
export function findPoToTheLeft(m: Match, x: number): number {
  let lo = -1;
  let hi = m.pobjs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m.pobjs[mid]!.x < x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** G_AdjustPoToTheLeft: incremental version of findPoToTheLeft starting from a previous result. */
export function adjustPoToTheLeft(m: Match, start: number, x: number): number {
  let n = start;
  const last = m.pobjs.length - 1;
  if (n < 0 || m.pobjs[n]!.x < x) {
    while (n < last && m.pobjs[n + 1]!.x < x) n++;
  } else {
    while (n >= 0 && m.pobjs[n]!.x > x) n--;
  }
  return n;
}

export const cellAt = (m: Match, row: number, col: number): number => m.cell[row]?.[col] ?? 0;
