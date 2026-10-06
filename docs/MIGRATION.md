# Перенос и воспроизведение проекта

Как поднять Real Tournament (Telegram Mini App) на другой машине или в другом аккаунте. Всё проверено на чистом клоне:
`npm ci`, `npx tsc --noEmit`, `npm test` (408 тестов), `npm run build` проходят без дополнительных шагов.

## 1. Что где живёт

| Что | Где | В репозитории |
|---|---|---|
| Игра (клиент) | `src/`, `index.html`, `public/` | да |
| Движок, боты, синтез звука | `src/engine`, `src/bots`, `src/audio` | да |
| Оригинальные ресурсы (карты, спрайты, `chars`) | `public/original/` | да |
| Сервер комнат (Cloudflare Durable Object) | `server/` | да |
| Тесты | `tests/` | да |
| CI/CD | `.github/workflows/pages.yml` | да |
| Заметки по оригиналу | `docs/notes/` | да |
| Задачи | `.beads/` (Dolt, см. `AGENTS.md`) | да |
| JDK и декомпилятор | `tools/jdk`, `tools/cfr.jar`, `tools/out` | нет (только для разбора оригинального JAR) |
| Исходники обложек | `art/` | нет (рабочая копия: `public/art/cover.jpg`) |
| Токен бота, токены Cloudflare | у сервисов | нет, никогда не коммитятся |

## 2. Локальная разработка

Нужен Node.js 22 (так же в CI) и git.

```bash
git clone https://github.com/nurullinm/real-tournament.git
cd real-tournament
npm ci
npm test            # 408 тестов
npm run dev         # vite, http://localhost:5173
```

Полезные параметры адреса в dev-режиме:
- `?autostart=dm&map=0` или `?autostart=ctf&map=1`: сразу в матч.
- `?server=ws://localhost:8787`: сервер комнат для мультиплеера (по умолчанию боевой).
- `?debug=1`: плашка с состоянием звука.
- В консоли браузера (только dev): `window.__rt` с `session`, `loop`, `ui`, `tickOnce`, `renderFrame`.

Локальный сервер комнат (в другом терминале):

```bash
cd server && npx wrangler dev --port 8787 --local
```

Без `BOT_TOKEN` локальный сервер не проверяет подпись Telegram, поэтому в браузере мультиплеер работает без Telegram.

## 3. Мультиплеер: как устроен

- Сервер (`server/worker.ts`, класс `Room`) только раздаёт тики: каждые 60 мс рассылает ввод всех людей. Симуляцию ведёт каждый клиент сам, движок детерминированный.
- Клиент предсказывает своё движение (`GameSession.predictTo`) и откатывает его, когда приходит настоящий тик (`cloneMatch` в `src/engine/clone.ts`).
- Протокол: `src/net/protocol.ts` (общий для клиента и сервера).
- Комната = Durable Object, имя по коду из 5 символов. Режимы: Deathmatch до 4 человек и захват флага 2 на 2.
- Проверка пользователя: подпись Telegram `initData` (`server/auth.ts`), нужен секрет `BOT_TOKEN`.

## 4. Перенос на свой Cloudflare-аккаунт

1. Войти: `npx wrangler login` (или задать `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`).
2. Имена воркеров: игра `real-tournament` (корневой `wrangler.toml`, статика из `dist/`), сервер комнат `real-tournament-rooms` (`server/wrangler.toml`). Если нужны другие имена, поменяйте `name` в обоих файлах.
3. Выложить сервер комнат и записать секрет:

   ```bash
   npm run deploy:rooms
   cd server && npx wrangler secret put BOT_TOKEN   # токен бота из BotFather
   ```

4. Узнать адрес сервера комнат из вывода деплоя (`https://<имя>.<субдомен>.workers.dev`) и прописать его в `src/net/client.ts`:
   `DEFAULT_SERVER = 'wss://<имя>.<субдомен>.workers.dev'` (схема `wss://`).
5. Выложить игру: `npm run deploy` (сборка и `wrangler deploy`). Адрес игры: `https://real-tournament.<субдомен>.workers.dev`.

Свой домен: в панели Cloudflare привяжите домен (Custom Domain) к обоим воркерам и обновите `DEFAULT_SERVER` и адрес Mini App у бота.

## 5. Автодеплой через GitHub Actions

Workflow `.github/workflows/pages.yml` при каждом пуше в `main`:
1. `build`: ставит зависимости, проверяет типы, гоняет тесты, собирает игру;
2. `deploy`: публикует на GitHub Pages (запасной адрес);
3. `cloudflare`: выкладывает сервер комнат и игру на Cloudflare. Шаг пропускается, если нет секрета.

Что нужно настроить в репозитории:
- секрет `CLOUDFLARE_API_TOKEN` с правами «Workers Scripts: Edit» и «Account Settings: Read» на нужный аккаунт:

  ```bash
  gh secret set CLOUDFLARE_API_TOKEN --repo <владелец>/real-tournament
  ```

- `CLOUDFLARE_ACCOUNT_ID` прописан прямо в workflow (`env` job `cloudflare`): замените на ID нового аккаунта.
- GitHub Pages: Settings → Pages → Source: GitHub Actions (если нужен запасной адрес).

## 6. Telegram-бот

1. В BotFather создать бота (или взять существующий) и получить токен.
2. Прописать адрес Mini App как кнопку меню (после каждого деплоя добавляем `?v=<хеш>`, чтобы обойти кеш Telegram):

   ```bash
   curl -s "https://api.telegram.org/bot<ТОКЕН>/setChatMenuButton" \
     -H 'Content-Type: application/json' \
     -d '{"menu_button":{"type":"web_app","text":"Play","web_app":{"url":"https://<адрес игры>/?v='"$(git rev-parse --short HEAD)"'"}}}'
   ```

3. Сервера у бота нет: команды в чате (`/start` и т. п.) ничего не делают, игра запускается кнопкой меню. Кнопка «Позвать друга» в лобби открывает окно пересылки с кодом комнаты и ссылкой на бота. Если у бота другое имя, поменяйте `realtournament_bot` в `shareRoom` (`src/ui/screens.ts`).
4. Mini App открывается в полноэкранном режиме и блокирует альбомную ориентацию (`src/platform/telegram.ts`).

## 7. Оригинальные ресурсы (если нужно заново разобрать JAR)

Игра работает на уже извлечённых ресурсах из `public/original/`. Заново они нужны только при изменении портированной логики. Тогда:
- оригинальные JAR лежат в `~/Downloads/Real-Tournament_J2ME_EN_v110/`;
- `tools/extract-jar.sh` достаёт ресурсы, `tools/decompile.sh` декомпилирует классы в `tools/out/` (нужны `tools/jdk` и `tools/cfr.jar`: скачайте любой JDK и CFR, пути в скриптах);
- главный источник логики: `tools/out/a10/C.java`. Выводы по нему записаны в `docs/notes/original-logic.md`, `map-format.md`, `parity-checklist.md`.

## 8. Чек-лист переезда

1. `git clone`, `npm ci`, `npm test`, `npm run dev`: игра запускается локально.
2. Cloudflare: `wrangler login`, `npm run deploy:rooms`, `wrangler secret put BOT_TOKEN`.
3. Прописать новый адрес сервера в `src/net/client.ts`.
4. `npm run deploy`: игра на Cloudflare.
5. Обновить кнопку меню бота (раздел 6).
6. По желанию: секрет `CLOUDFLARE_API_TOKEN` и новый `CLOUDFLARE_ACCOUNT_ID` в workflow для автодеплоя.
7. Проверка: открыть игру в Telegram, создать комнату, зайти вторым устройством по коду.

## 9. Известные ограничения

- Прямые вызовы `wss://` к `workers.dev` могут не проходить из некоторых сетей; при проблемах привяжите свой домен.
- На первом запуске iOS звук включается после первого касания экрана (ограничение системы). После блокировки телефона звук возвращается сам или при касании.
- Токен бота нельзя хранить в репозитории: только `wrangler secret put` и BotFather.
