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
