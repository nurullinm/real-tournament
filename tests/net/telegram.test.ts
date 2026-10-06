import { describe, expect, it } from 'vitest';
import { handleTelegram } from '../../server/telegram';

const ENV = { BOT_TOKEN: 'tok', WEBHOOK_SECRET: 's3cret', GAME_URL: 'https://game.example/' };
const req = (body: unknown, secret: string | null = 's3cret'): Request =>
  new Request('https://x/tg', { method: 'POST', headers: secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(body) });
const run = async (r: Request, env = ENV) => {
  const sent: Record<string, unknown>[] = [];
  const res = await handleTelegram(r, env, async (_t, b) => { sent.push(b); });
  return { status: res.status, sent };
};
const start = (text: string, lang = 'en') => ({ message: { chat: { id: 42 }, text, from: { language_code: lang } } });

describe('Telegram webhook', () => {
  it('answers /start with an inline button that opens the game', async () => {
    const { status, sent } = await run(req(start('/start')));
    expect(status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ chat_id: 42, reply_markup: { inline_keyboard: [[{ text: 'Play', web_app: { url: 'https://game.example/' } }]] } });
  });

  it('speaks Russian to Russian-language users, also for /play and /start@bot', async () => {
    for (const text of ['/start', '/play', '/start@realtournament_bot', '/start payload']) {
      const { sent } = await run(req(start(text, 'ru')));
      expect((sent[0] as { reply_markup: { inline_keyboard: { text: string }[][] } }).reply_markup.inline_keyboard[0]![0]!.text).toBe('Играть');
    }
  });

  it('ignores other messages and non-message updates', async () => {
    expect((await run(req(start('hello')))).sent).toHaveLength(0);
    expect((await run(req(start('/starting')))).sent).toHaveLength(0);
    expect((await run(req({ callback_query: {} }))).sent).toHaveLength(0);
  });

  it('refuses requests without the right secret and when not configured', async () => {
    expect((await run(req(start('/start'), 'wrong'))).status).toBe(403);
    expect((await run(req(start('/start'), null))).status).toBe(403);
    expect((await run(req(start('/start')), { ...ENV, WEBHOOK_SECRET: undefined as unknown as string })).status).toBe(403);
    expect((await run(req(start('/start'), 'wrong'))).sent).toHaveLength(0);
  });

  it('rejects malformed bodies', async () => {
    const r = new Request('https://x/tg', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 's3cret' }, body: 'not json' });
    expect((await run(r)).status).toBe(400);
  });
});
