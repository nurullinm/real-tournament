import { safeEqual } from './safe';

/** Telegram Mini App `initData` check (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */

const enc = new TextEncoder();

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export interface TgUser { id: number; name: string }

/** Returns the verified user, or null when the signature is wrong or the data is older than a day. */
export async function verifyInitData(initData: string, botToken: string, nowSec = Math.floor(Date.now() / 1000)): Promise<TgUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  if (!safeEqual(hex(await hmac(secret, check)), hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > 86400) return null;
  try {
    const u = JSON.parse(params.get('user') ?? '') as { id?: number; first_name?: string; username?: string };
    if (typeof u.id !== 'number') return null;
    return { id: u.id, name: u.first_name ?? u.username ?? 'Player' };
  } catch {
    return null;
  }
}
