import type { ClientMsg, ServerMsg } from './protocol';

/** Where the room server lives (Cloudflare Worker); override with ?server=... for local testing. */
export const DEFAULT_SERVER = 'wss://real-tournament-rooms.circ-ops.workers.dev';

export interface NetClient {
  send(m: ClientMsg): void;
  close(): void;
  readonly open: boolean;
}

export interface NetHandlers {
  message(m: ServerMsg): void;
  /** the socket closed or failed (including never connecting) */
  closed(): void;
}

interface SocketLike {
  readyState: number;
  send(d: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export function serverUrl(search = globalThis.location?.search ?? ''): string {
  const override = new URLSearchParams(search).get('server');
  return override && /^wss?:\/\//.test(override) ? override : DEFAULT_SERVER;
}

/** Opens a room connection; messages sent before it is open are queued. */
export function connectRoom(code: string, hello: ClientMsg, h: NetHandlers, url = serverUrl(), make: (u: string) => SocketLike = (u) => new WebSocket(u) as unknown as SocketLike): NetClient {
  const ws = make(`${url}/room/${code}`);
  const queue: string[] = [JSON.stringify(hello)];
  let dead = false;
  const closed = (): void => { if (!dead) { dead = true; h.closed(); } };
  ws.onopen = () => { for (const q of queue.splice(0)) ws.send(q); };
  ws.onmessage = (e) => {
    try { h.message(JSON.parse(String(e.data)) as ServerMsg); } catch { /* ignore malformed */ }
  };
  ws.onclose = closed;
  ws.onerror = closed;
  return {
    send(m) {
      const txt = JSON.stringify(m);
      if (ws.readyState === 1) ws.send(txt);
      else if (ws.readyState === 0) queue.push(txt);
    },
    close() {
      dead = true;
      try { ws.close(); } catch { /* ignore */ }
    },
    get open() { return ws.readyState === 1 && !dead; },
  };
}
