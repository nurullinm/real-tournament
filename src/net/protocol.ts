/** Wire protocol shared by the game client and the Cloudflare room server (JSON over WebSocket). */

export const MAX_PLAYERS = 4;
export const NAME_MAX = 16;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const NET_TICK_MS = 60;
/** seconds of "get ready" between the host's start and the first tick */
export const COUNTDOWN_SECONDS = 3;

export type RoomMode = 'dm' | 'ctf';

export interface RoomConfig {
  mode: RoomMode;
  /** DM maps 0..6, CTF maps 0..4 */
  mapId: number;
  /** AI bots filling the match; humans + bots is at most 4 and at least 2 */
  bots: number;
  /** DM: frags to win (0 = none, steps of 5 up to 50); CTF: captures to win (0 = none, up to 9) */
  fragLimit: number;
  skill: 0 | 1 | 2 | 3 | 4;
  violence: boolean;
  noMedikits: boolean;
}

export const DEFAULT_CONFIG: RoomConfig = { mode: 'dm', mapId: 0, bots: 3, fragLimit: 10, skill: 2, violence: true, noMedikits: false };

export interface LobbyPlayer {
  slot: number; name: string; host: boolean;
  /** vest colour 0 blue, 1 red, 2 green, 3 yellow (in CTF it is the team colour) */
  color: number;
  /** CTF team: 0 blue, 1 red */
  team: number;
}

/** 2v2: each team has two places */
export const TEAM_SIZE = 2;

/** One player's input for a tick: held-button bitmask (engine CMD_* bits) plus one-shot weapon pulses. */
export interface WireInput { c: number; ws: -1 | 0 | 1 | 2; wd: -1 | 0 | 1 }

export type ClientMsg =
  | { t: 'hello'; name: string; initData?: string; /** true when this client made up the code: the room must be new */ create: boolean }
  | { t: 'name'; name: string }
  | { t: 'color'; color: number }
  | { t: 'team'; team: number }
  | { t: 'cfg'; cfg: RoomConfig }
  | { t: 'start' }
  /** `at`: the tick this input is meant to apply from (client-side prediction); omitted/old = as soon as possible */
  | { t: 'in'; c: number; ws: -1 | 0 | 1 | 2; wd: -1 | 0 | 1; at?: number }
  | { t: 'ping'; ts: number }
  | { t: 'over' };

export type ServerMsg =
  | { t: 'welcome'; slot: number; code: string }
  | { t: 'lobby'; players: LobbyPlayer[]; cfg: RoomConfig }
  /** `slot` is this client's fighter number; `humanSlots`, `names` and `colors` are indexed by fighter number ('' for bots) */
  | { t: 'start'; seed: number; cfg: RoomConfig; humanSlots: number[]; names: string[]; colors: number[]; slot: number }
  /** server tick n: input of every human slot, plus slots that dropped out at this tick (bots take over) */
  | { t: 'tick'; n: number; i: WireInput[]; d?: number[] }
  | { t: 'pong'; ts: number }
  /** the host pressed start: 3, 2, 1, then the `start` message follows */
  | { t: 'countdown'; n: number }
  | { t: 'error'; reason: 'full' | 'started' | 'auth' | 'bad' | 'notfound' };

export function cleanName(raw: unknown, fallback = 'Player'): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || fallback;
}

export function clampConfig(c: Partial<RoomConfig> | undefined, humans: number): RoomConfig {
  const d = DEFAULT_CONFIG;
  const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);
  const mode: RoomMode = c?.mode === 'ctf' ? 'ctf' : 'dm';
  return {
    mode,
    mapId: num(c?.mapId, 0, mode === 'ctf' ? 4 : 6, d.mapId),
    // CTF is always 2v2: bots fill the empty places
    bots: mode === 'ctf' ? MAX_PLAYERS - humans : num(c?.bots, humans <= 1 ? 1 : 0, MAX_PLAYERS - humans, Math.min(d.bots, MAX_PLAYERS - humans)),
    fragLimit: mode === 'ctf' ? num(c?.fragLimit, 0, 9, 3) : num(c?.fragLimit, 0, 50, d.fragLimit),
    skill: num(c?.skill, 0, 4, d.skill) as RoomConfig['skill'],
    violence: c?.violence !== false,
    noMedikits: c?.noMedikits === true,
  };
}

/**
 * Fighter number of every human at match start. Deathmatch: 0..n-1 in join order. CTF: team 0 takes fighters 0 and 1,
 * team 1 takes 2 and 3 (the engine's sides). Returns null when a team has more than TEAM_SIZE players.
 */
export function assignFighters(mode: RoomMode, players: { team: number }[]): number[] | null {
  if (mode === 'dm') return players.map((_, i) => i);
  const next = [0, TEAM_SIZE];
  const out: number[] = [];
  for (const p of players) {
    const team = p.team === 1 ? 1 : 0;
    const n = next[team]!++;
    if (n >= (team + 1) * TEAM_SIZE) return null;
    out.push(n);
  }
  return out;
}

export function randomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** Largest accepted message: `hello` carries Telegram's signed initData, everything else is tiny. */
export const MAX_HELLO_CHARS = 4096;
export const MAX_MESSAGE_CHARS = 512;

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Parses and validates one client message from the wire. Anything that is not exactly a well-formed message of the
 * protocol (wrong type, out-of-range number, oversize, not JSON) gives null: the types in ClientMsg exist only at compile
 * time, so a modified client can send anything.
 */
export function parseClientMessage(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > MAX_HELLO_CHARS) return null;
  let m: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if (m.t !== 'hello' && raw.length > MAX_MESSAGE_CHARS) return null;
  switch (m.t) {
    case 'hello':
      if (typeof m.name !== 'string' || typeof m.create !== 'boolean') return null;
      if (m.initData !== undefined && (typeof m.initData !== 'string' || m.initData.length > 3072)) return null;
      return { t: 'hello', name: m.name, create: m.create, ...(m.initData !== undefined ? { initData: m.initData as string } : {}) };
    case 'name':
      return typeof m.name === 'string' ? { t: 'name', name: m.name } : null;
    case 'color':
      return isInt(m.color, 0, 3) ? { t: 'color', color: m.color } : null;
    case 'team':
      return m.team === 0 || m.team === 1 ? { t: 'team', team: m.team } : null;
    case 'cfg':
      return typeof m.cfg === 'object' && m.cfg !== null && !Array.isArray(m.cfg) ? { t: 'cfg', cfg: m.cfg as RoomConfig } : null;
    case 'start':
      return { t: 'start' };
    case 'over':
      return { t: 'over' };
    case 'ping':
      return typeof m.ts === 'number' && Number.isFinite(m.ts) ? { t: 'ping', ts: m.ts } : null;
    case 'in': {
      if (!isInt(m.c, 0, 0xffff)) return null;
      if (!(m.ws === -1 || m.ws === 0 || m.ws === 1 || m.ws === 2)) return null;
      if (!(m.wd === -1 || m.wd === 0 || m.wd === 1)) return null;
      if (m.at !== undefined && !(typeof m.at === 'number' && Number.isFinite(m.at))) return null;
      return { t: 'in', c: m.c, ws: m.ws, wd: m.wd, ...(m.at !== undefined ? { at: m.at as number } : {}) };
    }
    default:
      return null;
  }
}
