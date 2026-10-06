import { verifyInitData } from './auth';
import {
  CODE_LENGTH, MAX_PLAYERS, NET_TICK_MS, clampConfig, cleanName, DEFAULT_CONFIG,
  type ClientMsg, type RoomConfig, type ServerMsg, type WireInput,
} from '../src/net/protocol';

interface Env { ROOMS: DurableObjectNamespace; BOT_TOKEN?: string; ALLOWED_ORIGIN?: string }

const idle = (): WireInput => ({ c: 0, ws: -1, wd: 0 });

interface Player { slot: number; name: string; color: number; ws: WebSocket; host: boolean; held: number; ws_: -1 | 0 | 1 | 2; wd: -1 | 0 | 1; alive: boolean }

export class Room {
  private players = new Map<number, Player>();
  private cfg: RoomConfig = { ...DEFAULT_CONFIG };
  private started = false;
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingDrops: number[] = [];
  private humans = 0;

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
      players: [...this.players.values()].filter((p) => p.alive).map((p) => ({ slot: p.slot, name: p.name, host: p.host, color: p.color })),
    });
  }

  private attach(ws: WebSocket): void {
    let me: Player | null = null;
    ws.addEventListener('message', async (ev) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(ev.data)) as ClientMsg; } catch { return; }
      if (msg.t === 'hello') {
        if (me) return;
        if (this.started) return this.reject(ws, 'started');
        const live = [...this.players.values()].filter((p) => p.alive);
        if (msg.create && live.length > 0) return this.reject(ws, 'bad'); // code collision
        if (!msg.create && live.length === 0) return this.reject(ws, 'notfound');
        if (live.length >= MAX_PLAYERS) return this.reject(ws, 'full');
        let name = cleanName(msg.name);
        if (this.env.BOT_TOKEN) {
          const u = msg.initData ? await verifyInitData(msg.initData, this.env.BOT_TOKEN) : null;
          if (!u) return this.reject(ws, 'auth');
          name = cleanName(msg.name, u.name);
        }
        if (this.started) return this.reject(ws, 'started');
        const slot = [...Array(MAX_PLAYERS).keys()].find((s) => !this.players.get(s)?.alive)!;
        const taken = new Set(live.map((p) => p.color));
        const color = [0, 1, 2, 3].find((c) => !taken.has(c)) ?? 0;
        me = { slot, name, color, ws, host: live.length === 0, held: 0, ws_: -1, wd: 0, alive: true };
        this.players.set(slot, me);
        this.cfg = clampConfig(this.cfg, live.length + 1);
        this.send(ws, { t: 'welcome', slot, code: '' });
        this.lobby();
        return;
      }
      if (!me || !me.alive) return;
      switch (msg.t) {
        case 'name':
          if (!this.started) { me.name = cleanName(msg.name, me.name); this.lobby(); }
          break;
        case 'color':
          if (!this.started && Number.isInteger(msg.color) && msg.color >= 0 && msg.color <= 3
            && ![...this.players.values()].some((p) => p.alive && p !== me && p.color === msg.color)) {
            me.color = msg.color;
            this.lobby();
          }
          break;
        case 'cfg':
          if (me.host && !this.started) {
            this.cfg = clampConfig(msg.cfg, [...this.players.values()].filter((p) => p.alive).length);
            this.lobby();
          }
          break;
        case 'start':
          if (me.host && !this.started) this.begin();
          break;
        case 'in':
          if (this.started) {
            me.held = msg.c & 0xffff;
            if (msg.ws !== -1) me.ws_ = msg.ws;
            if (msg.wd !== 0) me.wd = msg.wd;
          }
          break;
        case 'over':
          this.stop();
          break;
      }
    });
    const gone = (): void => { if (me) this.leave(me); };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  private reject(ws: WebSocket, reason: 'full' | 'started' | 'auth' | 'bad' | 'notfound'): void {
    this.send(ws, { t: 'error', reason });
    try { ws.close(1008, reason); } catch { /* ignore */ }
  }

  private begin(): void {
    // humans keep their slot numbers; compact them to 0..n-1 so engine fighters 0..humans-1 are the humans
    const live = [...this.players.values()].filter((p) => p.alive).sort((a, b) => a.slot - b.slot);
    this.players.clear();
    live.forEach((p, i) => { p.slot = i; this.players.set(i, p); });
    this.humans = live.length;
    this.cfg = clampConfig(this.cfg, this.humans);
    this.started = true;
    this.tick = 0;
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0) || 1;
    const names = live.map((p) => p.name);
    const colors = live.map((p) => p.color);
    for (const p of live) this.send(p.ws, { t: 'start', seed, cfg: this.cfg, humans: this.humans, names, colors, slot: p.slot });
    this.timer = setInterval(() => this.step(), NET_TICK_MS);
  }

  private step(): void {
    this.tick++;
    const i: WireInput[] = [];
    for (let s = 0; s < this.humans; s++) {
      const p = this.players.get(s);
      if (!p || !p.alive) { i.push(idle()); continue; }
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
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });
    const m = /^\/room\/([A-Z0-9]+)$/.exec(url.pathname);
    if (!m || m[1]!.length !== CODE_LENGTH) return new Response('real-tournament rooms', { status: 200 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1]!)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

