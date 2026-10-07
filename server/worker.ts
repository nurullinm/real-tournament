import { verifyInitData } from './auth';
import { RateLimiter } from './limits';
import { handleTelegram } from './telegram';
import {
  CODE_LENGTH, COUNTDOWN_SECONDS, MAX_PLAYERS, NET_TICK_MS, TEAM_SIZE, assignFighters, clampConfig, cleanName, DEFAULT_CONFIG,
  parseClientMessage, type RoomConfig, type ServerMsg, type WireInput,
} from '../src/net/protocol';

interface Env { ROOMS: DurableObjectNamespace; BOT_TOKEN?: string; ALLOWED_ORIGIN?: string; WEBHOOK_SECRET?: string; GAME_URL?: string }

const MAX_AHEAD = 30; // ticks a client may stamp into the future (about 2 s)
const MAX_QUEUE = 64; // pending stamped inputs per player: more than any client sends in the 2 s it may stamp ahead
const HELLO_TIMEOUT_MS = 8000; // a socket that does not introduce itself is dropped
const MAX_TICKS = Math.floor((30 * 60 * 1000) / NET_TICK_MS); // a room never runs longer than 30 minutes
const RATE_MAX = 150; // messages per socket per second (input changes are at most one per frame)
const idle = (): WireInput => ({ c: 0, ws: -1, wd: 0 });

interface Player { slot: number; /** verified Telegram id (absent in dev without a bot token) */ uid?: number; over: boolean; name: string; color: number; team: number; ws: WebSocket; host: boolean; held: number; ws_: -1 | 0 | 1 | 2; wd: -1 | 0 | 1; alive: boolean;
  /** inputs waiting for their tick, sorted by `at` */
  queue: { at: number; c: number; ws: -1 | 0 | 1 | 2; wd: -1 | 0 | 1 }[] }

export class Room {
  private players = new Map<number, Player>();
  private cfg: RoomConfig = { ...DEFAULT_CONFIG };
  private started = false;
  /** the host pressed start and the countdown is running: the lobby is frozen */
  private starting = false;
  private countdown: ReturnType<typeof setTimeout> | null = null;
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingDrops: number[] = [];

  constructor(_state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, m: ServerMsg): void { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } }
  private broadcast(m: ServerMsg): void { for (const p of this.players.values()) if (p.alive) this.send(p.ws, m); }

  private lobby(): void {
    this.broadcast({
      t: 'lobby', cfg: this.cfg,
      players: [...this.players.values()].filter((p) => p.alive).map((p) => ({ slot: p.slot, name: p.name, host: p.host, color: p.color, team: p.team })),
    });
  }

  private alivePlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.alive);
  }

  /**
   * Seats a verified newcomer. Synchronous on purpose: every check and the seating happen in one step, so two hellos that
   * were waiting for the signature check cannot both take the last place.
   */
  private admit(ws: WebSocket, msg: { name: string; create: boolean }, uid: number | undefined, tgName: string | undefined): Player | null {
    if (this.started || this.starting) { this.reject(ws, 'started'); return null; }
    // the same Telegram account joining again (a second tab, or a reconnect before the old socket was noticed as dead)
    // replaces its old seat instead of taking another one
    if (uid !== undefined) {
      const old = this.alivePlayers().find((p) => p.uid === uid);
      if (old) {
        try { old.ws.close(1000, 'replaced'); } catch { /* ignore */ }
        this.leave(old);
      }
    }
    const live = this.alivePlayers();
    if (msg.create && live.length > 0) { this.reject(ws, 'bad'); return null; } // code collision
    if (!msg.create && live.length === 0) { this.reject(ws, 'notfound'); return null; }
    const slot = [...Array(MAX_PLAYERS).keys()].find((n) => !this.players.get(n)?.alive);
    if (live.length >= MAX_PLAYERS || slot === undefined) { this.reject(ws, 'full'); return null; }
    const taken = new Set(live.map((p) => p.color));
    const color = [0, 1, 2, 3].find((c) => !taken.has(c)) ?? 0;
    // CTF: the team with fewer players (blue first)
    const inTeam1 = live.filter((p) => p.team === 1).length;
    const team = live.length - inTeam1 > inTeam1 ? 1 : 0;
    const me: Player = {
      slot, uid, over: false, name: cleanName(msg.name, tgName), color, team, ws, host: live.length === 0,
      held: 0, ws_: -1, wd: 0, alive: true, queue: [],
    };
    this.players.set(slot, me);
    this.cfg = clampConfig(this.cfg, live.length + 1);
    this.send(ws, { t: 'welcome', slot, code: '' });
    this.lobby();
    return me;
  }

  private attach(ws: WebSocket): void {
    let me: Player | null = null;
    let helloSeen = false;
    const limiter = new RateLimiter(RATE_MAX, 1000);
    const helloTimer = setTimeout(() => { if (!me) { try { ws.close(1008, 'hello timeout'); } catch { /* ignore */ } } }, HELLO_TIMEOUT_MS);
    ws.addEventListener('message', async (ev) => {
      // flooding, oversize, non-JSON, wrong types, out-of-range values: all dropped before they reach any logic
      if (!limiter.allow(Date.now())) {
        try { ws.close(1008, 'rate limit'); } catch { /* ignore */ }
        return;
      }
      const msg = parseClientMessage(ev.data);
      if (!msg) return;
      if (msg.t === 'hello') {
        if (helloSeen) return; // one hello per socket, also while the first is still being verified
        helloSeen = true;
        if (this.started || this.starting) return this.reject(ws, 'started');
        let uid: number | undefined;
        let tgName: string | undefined;
        if (this.env.BOT_TOKEN) {
          const u = msg.initData ? await verifyInitData(msg.initData, this.env.BOT_TOKEN) : null;
          if (!u) return this.reject(ws, 'auth');
          uid = u.id;
          tgName = u.name;
        }
        me = this.admit(ws, msg, uid, tgName);
        if (me) clearTimeout(helloTimer);
        return;
      }
      if (!me || !me.alive) return;
      switch (msg.t) {
        case 'name':
          if (!this.started && !this.starting) { me.name = cleanName(msg.name, me.name); this.lobby(); }
          break;
        case 'color':
          if (!this.started && !this.starting && !this.alivePlayers().some((p) => p !== me && p.color === msg.color)) {
            me.color = msg.color;
            this.lobby();
          }
          break;
        case 'team':
          if (!this.started && !this.starting && this.alivePlayers().filter((p) => p !== me && p.team === msg.team).length < TEAM_SIZE) {
            me.team = msg.team;
            this.lobby();
          }
          break;
        case 'cfg':
          if (me.host && !this.started && !this.starting) {
            this.cfg = clampConfig(msg.cfg, this.alivePlayers().length);
            this.lobby();
          }
          break;
        case 'start':
          if (me.host && !this.started && !this.starting) this.startCountdown();
          break;
        case 'in':
          if (this.started) {
            // an input is meant for tick `at` (the client predicts ahead); a late or unstamped one applies at the next tick
            const at = msg.at === undefined ? 0 : Math.min(Math.max(Math.floor(msg.at), 0), this.tick + MAX_AHEAD);
            const entry = { at, c: msg.c, ws: msg.ws, wd: msg.wd };
            let i = me.queue.length;
            while (i > 0 && me.queue[i - 1]!.at > at) i--;
            me.queue.splice(i, 0, entry);
            // bounded memory and work: when a client queues more than it can legitimately need, its oldest inputs go
            while (me.queue.length > MAX_QUEUE) me.queue.shift();
          }
          break;
        case 'ping':
          this.send(ws, { t: 'pong', ts: msg.ts });
          break;
        case 'over':
          // a client says its simulation reached the end of the match; the room stops only when every player says so
          // (or leaves), so one player cannot end the match for the others
          if (this.started) {
            me.over = true;
            if (this.alivePlayers().every((p) => p.over)) this.stop();
          }
          break;
      }
    });
    const gone = (): void => { clearTimeout(helloTimer); if (me) this.leave(me); };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  private reject(ws: WebSocket, reason: 'full' | 'started' | 'auth' | 'bad' | 'notfound'): void {
    this.send(ws, { t: 'error', reason });
    try { ws.close(1008, reason); } catch { /* ignore */ }
  }

  /** "Get ready": 3, 2, 1 for everybody, then the match begins. The lobby is frozen meanwhile. */
  private startCountdown(): void {
    this.starting = true;
    let n = COUNTDOWN_SECONDS;
    const tick = (): void => {
      if (n > 0) {
        this.broadcast({ t: 'countdown', n });
        n--;
        this.countdown = setTimeout(tick, 1000);
      } else {
        this.countdown = null;
        this.starting = false;
        this.begin();
      }
    };
    tick();
  }

  private begin(): void {
    const live = [...this.players.values()].filter((p) => p.alive).sort((a, b) => a.slot - b.slot);
    this.cfg = clampConfig(this.cfg, live.length);
    // every human gets a fighter number (DM: join order; CTF: blue team 0-1, red team 2-3) and keeps it for the match
    const fighters = assignFighters(this.cfg.mode, live);
    if (!fighters) return; // a team is over-full: the host fixes the teams first
    this.players.clear();
    live.forEach((p, i) => { p.slot = fighters[i]!; this.players.set(p.slot, p); });
    this.started = true;
    this.tick = 0;
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0) || 1;
    const names = ['', '', '', ''];
    const colors = [0, 1, 2, 3];
    for (const p of live) { names[p.slot] = p.name; colors[p.slot] = p.color; }
    const humanSlots = live.map((p) => p.slot);
    for (const p of live) this.send(p.ws, { t: 'start', seed, cfg: this.cfg, humanSlots, names, colors, slot: p.slot });
    this.timer = setInterval(() => this.step(), NET_TICK_MS);
  }

  private step(): void {
    this.tick++;
    if (this.tick > MAX_TICKS) { this.stop(); return; }
    const i: WireInput[] = [];
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const p = this.players.get(s);
      if (!p || !p.alive) { i.push(idle()); continue; }
      while (p.queue.length > 0 && p.queue[0]!.at <= this.tick) {
        const e = p.queue.shift()!;
        p.held = e.c;
        if (e.ws !== -1) p.ws_ = e.ws;
        if (e.wd !== 0) p.wd = e.wd;
      }
      i.push({ c: p.held, ws: p.ws_, wd: p.wd });
      p.ws_ = -1; p.wd = 0; // pulses are delivered exactly once
    }
    const d = this.pendingDrops;
    this.pendingDrops = [];
    this.broadcast(d.length ? { t: 'tick', n: this.tick, i, d } : { t: 'tick', n: this.tick, i });
    if (![...this.players.values()].some((p) => p.alive)) this.stop();
  }

  private leave(p: Player): void {
    if (!p.alive) return;
    p.alive = false;
    if (this.started) {
      this.pendingDrops.push(p.slot);
    } else {
      this.players.delete(p.slot);
      if (p.host) { const next = [...this.players.values()].find((q) => q.alive); if (next) next.host = true; }
      this.cfg = clampConfig(this.cfg, [...this.players.values()].filter((q) => q.alive).length);
      this.lobby();
    }
    if (![...this.players.values()].some((q) => q.alive)) this.stop();
  }

  private stop(): void {
    if (this.countdown) clearTimeout(this.countdown);
    this.countdown = null;
    this.starting = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/tg' && req.method === 'POST') return handleTelegram(req, env); // Telegram webhook (own secret check)
    const origin = req.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });
    const m = /^\/room\/([A-Z0-9]+)$/.exec(url.pathname);
    if (!m || m[1]!.length !== CODE_LENGTH) return new Response('real-tournament rooms', { status: 200 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1]!)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

