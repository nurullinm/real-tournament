import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../../server/auth';

const TOKEN = '123456:TEST-TOKEN';
function sign(fields: Record<string, string>): string {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const NOW = 1_800_000_000;
const user = JSON.stringify({ id: 7, first_name: 'Marat' });

describe('Telegram initData verification', () => {
  it('accepts a correctly signed, fresh payload', async () => {
    const u = await verifyInitData(sign({ auth_date: String(NOW - 60), user }), TOKEN, NOW);
    expect(u).toEqual({ id: 7, name: 'Marat' });
  });
  it('rejects tampering, wrong token, stale data and missing hash', async () => {
    const good = sign({ auth_date: String(NOW - 60), user });
    expect(await verifyInitData(good.replace('Marat', 'Evil'), TOKEN, NOW)).toBeNull();
    expect(await verifyInitData(good, 'other:token', NOW)).toBeNull();
    expect(await verifyInitData(sign({ auth_date: String(NOW - 90000), user }), TOKEN, NOW)).toBeNull();
    expect(await verifyInitData('auth_date=1', TOKEN, NOW)).toBeNull();
  });
});
