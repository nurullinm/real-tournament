/** Telegram webhook: answers /start and /play with a message carrying an "open the game" button. */

export interface TgEnv { BOT_TOKEN?: string; WEBHOOK_SECRET?: string; GAME_URL?: string }

interface Update { message?: { chat?: { id?: number }; text?: string; from?: { language_code?: string } } }

export type SendMessage = (token: string, body: Record<string, unknown>) => Promise<void>;

const TEXTS = {
  ru: {
    text: '🎮 Real Tournament — культовый мобильный шутер, теперь в Telegram.\n\n'
      + '• Дэтматч / Захват флага\n• Одиночная / Мультиплеер (до 4 игроков)\n\n'
      + 'Нажмите «Играть», чтобы начать.',
    button: '🎮 Играть',
  },
  en: {
    text: '🎮 Real Tournament — the cult mobile shooter, now in Telegram.\n\n'
      + '• Deathmatch / Capture the flag\n• Solo / Multiplayer (up to 4 players)\n\n'
      + 'Tap “Play” to start.',
    button: '🎮 Play',
  },
} as const;

const START = /^\/(start|play)(@\w+)?(\s|$)/i;

export const sendViaApi: SendMessage = async (token, body) => {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
};

/** Handles one update; returns the HTTP status for Telegram. Wrong or missing secret: 403, nothing is processed. */
export async function handleTelegram(req: Request, env: TgEnv, send: SendMessage = sendViaApi): Promise<Response> {
  const secret = env.WEBHOOK_SECRET;
  if (!env.BOT_TOKEN || !secret || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return new Response('forbidden', { status: 403 });
  let update: Update;
  try { update = (await req.json()) as Update; } catch { return new Response('bad request', { status: 400 }); }
  const msg = update.message;
  const chat = msg?.chat?.id;
  if (typeof chat === 'number' && typeof msg?.text === 'string' && START.test(msg.text) && env.GAME_URL) {
    const t = msg.from?.language_code?.toLowerCase().startsWith('ru') ? TEXTS.ru : TEXTS.en;
    await send(env.BOT_TOKEN, {
      chat_id: chat, text: t.text,
      reply_markup: { inline_keyboard: [[{ text: t.button, web_app: { url: env.GAME_URL } }]] },
    });
  }
  return new Response('ok');
}
