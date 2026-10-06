import type { GameMap } from '../assets/types';
import type { Rng } from './rng';

export type WeaponKind = 0 | 1 | 2; // 0 saw, 1 laser pistol, 2 bazooka
export const MAX_AMMO = [0, 99, 10] as const;
export const TICK_MS = 60;

/** Original command bits (man_presscommand). */
export const CMD_JUMP = 2;
export const CMD_LEFT = 4;
export const CMD_RIGHT = 0x20;
export const CMD_ACTION = 0x40;
export const CMD_FIRE = 0x100;

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  action: boolean;
  /** direct weapon pick (-1 = none); one-tick pulse */
  weaponSelect: -1 | 0 | 1 | 2;
  /** cycle to next/previous usable weapon; one-tick pulse */
  weaponDelta: -1 | 0 | 1;
}

export const NO_INPUT: InputState = {
  left: false, right: false, jump: false, fire: false, action: false, weaponSelect: -1, weaponDelta: 0,
};

export interface Fighter {
  number: number;
  side: number;
  color: number;
  flagBaseLeft: number;
  flagBaseRight: number;
  starts: number[];
  x: number;
  y: number;
  u: number;
  v: number;
  xspeed: number;
  /** vertical speed, 8 fractional bits */
  yspeedFix: number;
  hasSupport: boolean;
  liftcar: number;
  headsLeft: boolean;
  jumpThrust: boolean;
  frame: number;
  leftPoM1: number;
  rightPo: number;
  hp: number;
  armor: number;
  isCycling: boolean;
  isPassenger: boolean;
  isCarrying: boolean;
  ammo: [number, number, number];
  weaponPresent: [boolean, boolean, boolean];
  currentWeapon: number;
  pendingWeapon: number;
  weaponState: number;
  busySequence: readonly number[] | null;
  busyIndex: number;
  aiJumpDestX: number;
  aiIgnoreChasers: boolean;
  aiCycleDestX: number;
  aiCycleDestY: number;
  aiNodeBehind: number;
  aiNodeAhead: number;
  aiColorFlag: number;
  /** 0 defend, 1 attack, 2 roam */
  aiOrder: number;
}

export interface PobjState {
  type: number;
  x: number;
  y: number;
  data1: number;
  data2: number;
  data3: number;
}

export interface Projectile {
  type: number; // 0 = free
  x: number;
  y: number;
  v: number;
  owner: number;
  /** x beyond which the rocket detonates (range limit) */
  selfLiq: number;
}

export interface Ray {
  x1: number;
  x2: number;
  y: number;
  tick: number;
  bright: number;
  dim: number;
}

export type GameEvent =
  | { kind: 'sound'; name: string; x: number; y: number }
  | { kind: 'fx'; seq: string; x: number; y: number }
  | { kind: 'kill'; killer: number; victim: number }
  | { kind: 'flagTaken'; side: number }
  | { kind: 'capture'; side: number };

/** Hooks implemented by the bots module; no-ops when no bots are installed. */
export interface AiHooks {
  catchGround(m: Match, f: Fighter): void;
  findNearestNode(m: Match, f: Fighter): void;
  makeDecision(m: Match, f: Fighter): void;
  makeStrategicalDecision(m: Match): void;
  setCycleDestination(m: Match, f: Fighter): void;
  controlFighter(m: Match, f: Fighter): number;
  controlCyclist(m: Match, f: Fighter): number;
}

export interface MatchOptions {
  mapId: number;
  mode: 'dm' | 'ctf';
  /** 0 very easy ... 4 very hard */
  skill: 0 | 1 | 2 | 3 | 4;
  /** DM: number of opponents (1..3). CTF ignores it. */
  bots: number;
  /** DM: frags to win (0 = none). CTF: captures to win. */
  fragLimit: number;
  noMedikits: boolean;
  /** original "Violence" option: gory deaths and blood */
  violence: boolean;
  /** CTF only: 2v2 with an ally (true) or 1v1... (false = single fighter) */
  team: boolean;
  /** 0..3 */
  playerColor: number;
}

export interface EngineAssets {
  /** tile id -> passable */
  passable: boolean[];
  /** per frame: laser/bazooka muzzle offsets (see computeMuzzle) */
  muzzleX: number[];
  muzzleY: number[];
}

export interface Match {
  opts: MatchOptions;
  map: GameMap;
  assets: EngineAssets;
  rng: Rng;
  ai: AiHooks;
  gameMode: 0 | 1; // 0 DM, 1 CTF
  tick: number;
  events: GameEvent[];

  ntilesx: number;
  ntilesy: number;
  mapWidth: number;
  mapHeight: number;
  /** cell[y][x] bit0 solid, bit1 blocks body, 4/8 can jump over gap left/right, 0x10/0x20 wide gap */
  cell: Uint8Array[];
  reachLeft: Uint8Array[];
  reachRight: Uint8Array[];

  fighters: Fighter[];
  numFighters: number;
  numSides: number;
  score: number[];
  sideColors: number[];
  fragLimit: number;
  lastDmStart: number;
  skill: number;
  aiReaction: number;
  aiJumpiness: number;

  pobjs: PobjState[];
  thinkers: number[];
  respawnQueue: number[]; // pobj indexes, FIFO
  projectiles: Projectile[]; // dense list, `type != 0` live
  rays: Ray[];
  flagIsTaken: [boolean, boolean];

  tram: { x: number; x1: number; x2: number; y: number; speed: number; state: number; passenger: number };
  cycle: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dockNodes: number[];
    dockPobjs: number[];
    leftNodes: number[];
    rightNodes: number[];
  } | null;
}

export const BRAKE_DISTANCE: readonly number[] = Array.from({ length: 16 }, (_, n) => (n * (n + 1)) / 2);
