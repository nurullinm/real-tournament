/** Wire protocol shared by the game client and the Cloudflare room server (JSON over WebSocket). */

export const MAX_PLAYERS = 4;
export const NAME_MAX = 16;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const NET_TICK_MS = 60;

export interface RoomConfig {
  mapId: number; // DM maps 0..6
  /** AI bots filling the match; humans + bots is at most 4 and at least 2 */
  bots: number;
  /** frags to win (0 = none) */
  fragLimit: number;
  skill: 0 | 1 | 2 | 3 | 4;
  violence: boolean;
  noMedikits: boolean;
}

export const DEFAULT_CONFIG: RoomConfig = { mapId: 0, bots: 3, fragLimit: 10, skill: 2, violence: true, noMedikits: false };

export interface LobbyPlayer { slot: number; name: string; host: boolean; /** vest colour 0 blue, 1 red, 2 green, 3 yellow */ color: number }

/** One player's input for a tick: held-button bitmask (engine CMD_* bits) plus one-shot weapon pulses. */
export interface WireInput { c: number; ws: -1 | 0 | 1 | 2; wd: -1 | 0 | 1 }

export type ClientMsg =
  | { t: 'hello'; name: string; initData?: string; /** true when this client made up the code: the room must be new */ create: boolean }
  | { t: 'name'; name: string }
  | { t: 'color'; color: number }
  | { t: 'cfg'; cfg: RoomConfig }
  | { t: 'start' }
  | { t: 'in'; c: number; ws: -1 | 0 | 1 | 2; wd: -1 | 0 | 1 }
  | { t: 'over' };

export type ServerMsg =
  | { t: 'welcome'; slot: number; code: string }
  | { t: 'lobby'; players: LobbyPlayer[]; cfg: RoomConfig }
  | { t: 'start'; seed: number; cfg: RoomConfig; humans: number; names: string[]; colors: number[]; slot: number }
  /** server tick n: input of every human slot, plus slots that dropped out at this tick (bots take over) */
  | { t: 'tick'; n: number; i: WireInput[]; d?: number[] }
  | { t: 'error'; reason: 'full' | 'started' | 'auth' | 'bad' | 'notfound' };

export function cleanName(raw: unknown, fallback = 'Player'): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || fallback;
}

export function clampConfig(c: Partial<RoomConfig> | undefined, humans: number): RoomConfig {
  const d = DEFAULT_CONFIG;
  const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);
  return {
    mapId: num(c?.mapId, 0, 6, d.mapId),
    bots: num(c?.bots, humans <= 1 ? 1 : 0, MAX_PLAYERS - humans, Math.min(d.bots, MAX_PLAYERS - humans)),
    fragLimit: num(c?.fragLimit, 0, 50, d.fragLimit),
    skill: num(c?.skill, 0, 4, d.skill) as RoomConfig['skill'],
    violence: c?.violence !== false,
    noMedikits: c?.noMedikits === true,
  };
}

export function randomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}
