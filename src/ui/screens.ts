import type { AllyOrder } from '../bots';
import type { Match } from '../engine/types';
import { botName, colorName, ctfMapName, dmMapName, onLangChange, orderLabel, skillName, t, type LangPref } from '../i18n';
import { scoreboard, type ScoreRow } from '../game/stats';
import { clear, h } from './dom';
import { cleanName, CODE_LENGTH, MAX_PLAYERS, NAME_MAX, TEAM_SIZE, normalizeCode, type LobbyPlayer, type RoomConfig } from '../net/protocol';
import { cycle, type GameSettings } from './settings';

export interface UiHandlers {
  start(mode: 'dm' | 'ctf'): void;
  continueGame(): void;
  resume(): void;
  /** the on-screen pause button was tapped */
  pause(): void;
  endGame(): void;
  settingsChanged(s: GameSettings): void;
  allyOrder(o: AllyOrder): void;
  /** online play: the room server connection is owned by main.ts */
  mpCreate(): void;
  mpJoin(code: string): void;
  mpLeave(): void;
  mpConfig(cfg: RoomConfig): void;
  mpColor(color: number): void;
  mpTeam(team: number): void;
  mpStart(): void;
}

export interface LobbyView { code: string; players: LobbyPlayer[]; cfg: RoomConfig; slot: number; host: boolean }

const SIDE_CSS = ['#3a5bff', '#e03030', '#25b25a', '#d9b800'];
/** Online rooms offer three bot levels (engine skills 1, 2 and 3 of 0..4) */
const BOT_LEVELS = [1, 2, 3] as const;
const levelIndex = (skill: number): number => Math.max(0, Math.min(BOT_LEVELS.length - 1, BOT_LEVELS.findIndex((l) => l >= skill) === -1 ? BOT_LEVELS.length - 1 : BOT_LEVELS.findIndex((l) => l >= skill)));
const levelName = (skill: number): string => t((['mp.level.0', 'mp.level.1', 'mp.level.2'] as const)[levelIndex(skill)]!);
const LANG_PREFS: readonly LangPref[] = ['auto', 'en', 'ru'];

export interface Ui {
  showMain(canContinue: boolean): void;
  showMultiplayer(error?: string): void;
  showConnecting(): void;
  showLobby(view: LobbyView): void;
  /** `note` is shown at the right of the window header (e.g. the team's frags) */
  showPause(canOrder: boolean, currentOrder: number, board?: ScoreRow[], note?: string): void;
  showResult(m: Match, online?: { names: string[]; slot: number }): void;
  hide(): void;
  /** true while any menu/overlay is covering the game */
  readonly open: boolean;
  /** the pause menu is showing (the pause button acts as Resume) */
  readonly paused: boolean;
  setPauseButton(on: boolean): void;
  setRotateOverlay(on: boolean): void;
}

/** Every section window has the same size and layout: header (back arrow + title), scrolling body, optional footer action. */
interface WindowParts {
  title: string;
  /** shows the return arrow in the header */
  onBack?: () => void;
  body: HTMLElement[];
  footer?: HTMLElement[];
  /** result card: smaller, no fixed height */
  small?: boolean;
  /** taller window for dense pages (online lobby) */
  tall?: boolean;
  /** extra class for the body (e.g. spaced sections) */
  bodyClass?: string;
  /** small muted text at the right of the header */
  note?: string;
  /** a link-style button at the right of the header */
  headLink?: HTMLElement;
}

export function createUi(root: HTMLElement, settings: GameSettings, handlers: UiHandlers): Ui {
  const menu = h('div', { class: 'ui menu' });
  const over = h('div', { class: 'ui over' });
  let paused = false;
  const pauseBtn = h('button', { id: 'pause', onclick: () => (paused ? handlers.resume() : handlers.pause()) });
  const rotateTitle = h('div');
  const rotateHint = h('div', { style: 'font-size:14px;color:#9ba0d0;font-weight:500' });
  const rotate = h('div', { class: 'rotate' }, h('div', { class: 'phone' }), rotateTitle, rotateHint);
  /** labels that live outside the screens (re-translated when the language changes) */
  const applyStatic = (): void => {
    pauseBtn.setAttribute('aria-label', paused ? t('pause.resume') : t('pause.pause'));
    rotateTitle.textContent = t('rotate.title');
    rotateHint.textContent = t('rotate.hint');
  };
  /** the pause button doubles as Resume while the pause menu is open, in the same corner */
  const setPausedUi = (on: boolean): void => {
    paused = on;
    pauseBtn.classList.toggle('resume', on);
    applyStatic();
  };
  applyStatic();
  onLangChange(applyStatic);
  root.append(menu, over, pauseBtn, rotate);
  // The on-screen keyboard: a tap outside the field closes it, a floating "Done" button is always reachable (in landscape
  // the keyboard hides nearly the whole screen), and the windows shrink to the visible part of the screen.
  const kbDone = h('button', { class: 'kbdone', text: t('common.done'), onclick: () => (document.activeElement as HTMLElement | null)?.blur() });
  root.append(kbDone);
  const fitToViewport = (): void => {
    const vv = window.visualViewport;
    root.style.setProperty('--vvh', `${vv ? vv.height : window.innerHeight}px`);
    root.style.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
    const el = document.activeElement;
    if (el instanceof HTMLInputElement) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  };
  const typing = (): boolean => document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement);
  const syncKeyboard = (): void => {
    for (const el of [root, menu, over]) el.classList.toggle('kb', typing());
    if (typing()) fitToViewport();
  };
  root.addEventListener('focusin', syncKeyboard);
  root.addEventListener('focusout', () => setTimeout(syncKeyboard, 0)); // moving between two fields keeps the layout
  window.visualViewport?.addEventListener('resize', syncKeyboard);
  window.visualViewport?.addEventListener('scroll', syncKeyboard);
  root.addEventListener('pointerdown', (e) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && e.target !== a && e.target !== kbDone) a.blur();
  }, true);
  let isOpen = false;

  const open = (layer: HTMLElement): void => {
    menu.classList.remove('open');
    over.classList.remove('open', 'plain');
    layer.classList.add('open');
    isOpen = true;
  };

  const save = (): void => handlers.settingsChanged(settings);

  function win(p: WindowParts): HTMLElement {
    const head = h('div', { class: 'win-head' });
    if (p.onBack) head.append(h('button', { class: 'back', 'aria-label': t('common.back'), onclick: p.onBack }));
    head.append(h('h2', { text: p.title }));
    if (p.note) head.append(h('div', { class: 'head-note', text: p.note }));
    if (p.headLink) head.append(p.headLink);
    const el = h('div', { class: `win${p.small ? ' small' : ''}${p.tall ? ' tall' : ''}` }, head, h('div', { class: `win-body${p.bodyClass ? ` ${p.bodyClass}` : ''}` }, ...p.body));
    if (p.footer?.length) el.append(h('div', { class: 'win-foot' }, ...p.footer));
    return el;
  }

  function selector(label: string, value: () => string, change: (dir: -1 | 1) => void, after?: () => void): HTMLElement {
    const val = h('div', { class: 'value', text: value(), role: 'button' });
    const update = (dir: -1 | 1) => () => {
      change(dir);
      val.textContent = value();
      save();
      after?.();
    };
    val.addEventListener('click', update(1));
    return h('div', { class: 'row' }, h('div', { class: 'label', text: label }),
      h('button', { class: 'btn arrow', text: '◀', 'aria-label': t('aria.prev', { label }), onclick: update(-1) }),
      val,
      h('button', { class: 'btn arrow', text: '▶', 'aria-label': t('aria.next', { label }), onclick: update(1) }));
  }
  const onOff = (v: boolean): string => (v ? t('common.on') : t('common.off'));
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement =>
    selector(label, () => onOff(get()), () => set(!get()));
  const button = (text: string, onclick: () => void, cls = ''): HTMLElement => h('button', { class: `btn ${cls}`, text, onclick });

  function mainScreen(canContinue: boolean): void {
    clear(menu);
    const col = h('div', { class: 'col' });
    if (canContinue) col.append(button(t('menu.continue'), handlers.continueGame, 'primary'));
    col.append(
      button(t('menu.dm'), () => setupScreen('dm', canContinue), canContinue ? '' : 'primary'),
      button(t('menu.ctf'), () => setupScreen('ctf', canContinue)),
      button(t('menu.multiplayer'), () => multiplayerScreen()),
      button(t('menu.settings'), () => settingsScreen(() => mainScreen(canContinue))),
      button(t('menu.help'), () => helpScreen(() => mainScreen(canContinue), menu)),
      button(t('menu.about'), () => aboutScreen(canContinue)),
    );
    col.append(h('div', { class: 'build', text: t('build', { build: __BUILD__ }) }));
    menu.append(col);
    open(menu);
  }

  function setupScreen(mode: 'dm' | 'ctf', canContinue: boolean): void {
    clear(menu);
    const body: HTMLElement[] = [];
    const limit = (n: number): string => (n === 0 ? t('common.none') : String(n));
    if (mode === 'dm') {
      const o = settings.dm;
      body.push(
        selector(t('setup.map'), () => dmMapName(o.map), (d) => { o.map = cycle(o.map, d, 7); }),
        selector(t('setup.skill'), () => skillName(o.skill), (d) => { o.skill = cycle(o.skill, d, 5); }),
        selector(t('setup.bots'), () => botName(o.bots), (d) => { o.bots = cycle(o.bots, d, 4); }),
        selector(t('setup.fragLimit'), () => limit(o.fragStep * 5), (d) => { o.fragStep = cycle(o.fragStep, d, 9); }),
        selector(t('setup.color'), () => colorName(o.color), (d) => { o.color = cycle(o.color, d, 4); }),
        toggle(t('setup.noMedikits'), () => o.noMedikits, (v) => { o.noMedikits = v; }),
      );
    } else {
      const o = settings.ctf;
      body.push(
        selector(t('setup.map'), () => ctfMapName(o.map), (d) => { o.map = cycle(o.map, d, 5); }),
        selector(t('setup.skill'), () => skillName(o.skill), (d) => { o.skill = cycle(o.skill, d, 5); }),
        selector(t('setup.teams'), () => (o.team ? t('setup.team.duo') : t('setup.team.solo')), () => { o.team = !o.team; }),
        selector(t('setup.flagLimit'), () => limit(o.flagLimit), (d) => { o.flagLimit = cycle(o.flagLimit, d, 10); }),
        selector(t('setup.teamColor'), () => colorName(o.color), (d) => { o.color = cycle(o.color, d, 2); }),
        toggle(t('setup.noMedikits'), () => o.noMedikits, (v) => { o.noMedikits = v; }),
      );
    }
    menu.append(win({
      title: mode === 'dm' ? t('menu.dm') : t('menu.ctf'),
      onBack: () => mainScreen(canContinue),
      body,
      footer: [button(t('common.start'), () => handlers.start(mode), 'primary')],
    }));
    open(menu);
  }

  function settingsScreen(back: () => void): void {
    clear(menu);
    const langText = (p: LangPref): string => t(`lang.${p}`);
    menu.append(win({
      title: t('menu.settings'),
      onBack: back,
      body: [
        nickField(true),
        toggle(t('settings.sound'), () => settings.sound, (v) => { settings.sound = v; }),
        toggle(t('settings.violence'), () => settings.violence, (v) => { settings.violence = v; }),
        // the language change re-draws this window right away in the new language
        selector(
          t('settings.language'),
          () => langText(settings.language),
          (d) => { settings.language = LANG_PREFS[cycle(LANG_PREFS.indexOf(settings.language), d, LANG_PREFS.length)]!; },
          () => settingsScreen(back),
        ),
      ],
    }));
    open(menu);
  }

  /** `inline`: label on the left and the field on the right, like every other settings row */
  const nickField = (inline = false): HTMLElement => {
    const input = h('input', { class: 'input', type: 'text', maxlength: NAME_MAX, placeholder: t('mp.nick.ph'), 'aria-label': t('mp.nick'), autocomplete: 'off', enterkeyhint: 'done', value: settings.nickname }) as HTMLInputElement;
    input.addEventListener('input', () => { settings.nickname = cleanName(input.value, ''); save(); });
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') input.blur(); }); // Enter / "Done" closes the keyboard
    if (inline) return h('div', { class: 'row' }, h('div', { class: 'label', text: t('settings.nickname') }), input);
    return h('div', { class: 'field' }, h('div', { class: 'plabel', text: t('mp.nick') }), input);
  };

  /** Counter-Strike style mini table: who has how many kills and deaths. */
  const scoreTable = (rows: ScoreRow[]): HTMLElement => {
    const g = h('div', { class: 'sb' });
    g.append(h('div', { class: 'sb-h' }), h('div', { class: 'sb-h', text: '' }), h('div', { class: 'sb-h n', text: t('sb.kills') }), h('div', { class: 'sb-h n', text: t('sb.deaths') }));
    for (const r of rows) {
      const cls = r.you ? 'you' : '';
      g.append(
        h('div', { class: `sb-c dot-c ${cls}` }, h('span', { class: 'dot', style: `background:${SIDE_CSS[r.color] ?? '#fff'}` })),
        h('div', { class: `sb-c nm ${cls}`, text: r.name }),
        h('div', { class: `sb-c n ${cls}`, text: String(r.kills) }),
        h('div', { class: `sb-c n ${cls}`, text: String(r.deaths) }),
      );
    }
    return g;
  };

  function multiplayerScreen(error?: string): void {
    clear(menu);
    const code = h('input', { class: 'input code', type: 'text', maxlength: CODE_LENGTH, placeholder: t('mp.code.ph'), 'aria-label': t('mp.code'), autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'go' }) as HTMLInputElement;
    code.addEventListener('input', () => { code.value = normalizeCode(code.value); });
    code.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { code.blur(); if (code.value.length === CODE_LENGTH) handlers.mpJoin(code.value); } });
    const msg = h('div', { class: 'mp-msg', text: error ?? '' });
    const join = (): void => {
      if (code.value.length !== CODE_LENGTH) { msg.textContent = t('mp.err.short'); return; }
      handlers.mpJoin(code.value);
    };
    menu.append(win({
      title: t('mp.title'),
      onBack: () => mainScreen(false),
      bodyClass: 'mp',
      body: [
        nickField(),
        button(t('mp.create'), handlers.mpCreate, 'primary'),
        h('div', { class: 'mp-or', text: t('mp.or') }),
        h('div', { class: 'joinrow' }, code, button(t('mp.join'), join, 'chip')),
        msg,
      ],
    }));
    open(menu);
  }

  function connectingScreen(): void {
    clear(menu);
    menu.append(win({ title: t('mp.title'), onBack: handlers.mpLeave, body: [h('div', { class: 'help', text: t('mp.connecting') })] }));
    open(menu);
  }

  /** which tab of the lobby is open (it survives the lobby re-drawing on every server message) */
  let lobbyTab: 'players' | 'settings' = 'players';

  function lobbyScreen(v: LobbyView): void {
    clear(menu);
    const cfg = v.cfg;
    const ctf = cfg.mode === 'ctf';
    const none = (n: number): string => (n === 0 ? t('common.none') : String(n));
    const me = v.players.find((p) => p.slot === v.slot);
    const tab: 'players' | 'settings' = v.host ? lobbyTab : 'players';

    const body: HTMLElement[] = [];
    if (v.host) {
      const tabs = h('div', { class: 'tabs lobby-tabs' });
      for (const [id, label] of [['players', t('mp.tab.players')], ['settings', t('mp.tab.settings')]] as const) {
        tabs.append(button(label, () => { lobbyTab = id; lobbyScreen(v); }, `chip${tab === id ? ' hot' : ''}`));
      }
      body.push(tabs);
    }

    if (tab === 'players') {
      const dotColor = (p: LobbyPlayer): string => SIDE_CSS[ctf ? p.team : p.color] ?? '#fff';
      const players = h('div', { class: 'pgrid' });
      for (const p of v.players) {
        players.append(h('div', { class: `pl${p.slot === v.slot ? ' me' : ''}` },
          h('span', { class: 'dot', style: `background:${dotColor(p)}` }),
          h('span', { class: 'pname', text: p.name }),
          h('span', { class: 'ptag', text: p.host ? '★' : '' })));
      }
      body.push(
        h('div', { class: 'coderow' }, h('div', { class: 'code-big', text: v.code }), button(t('mp.share'), () => shareRoom(v.code), 'chip')),
        h('div', { class: 'plabel', text: `${t('mp.players')} ${v.players.length}/${MAX_PLAYERS}` }),
        players,
      );
      if (ctf) {
        // two teams of two: pick one (a full team is disabled)
        const teamRow = h('div', { class: 'teamrow' });
        for (const team of [0, 1]) {
          const count = v.players.filter((p) => p.team === team).length;
          const label = `${team === 0 ? t('mp.team.blue') : t('mp.team.red')} ${count}/${TEAM_SIZE}`;
          teamRow.append(h('button', {
            class: `btn team t${team}${me?.team === team ? ' on' : ''}`, text: label,
            disabled: (count >= TEAM_SIZE && me?.team !== team) || undefined, onclick: () => handlers.mpTeam(team),
          }));
        }
        body.push(teamRow);
      } else {
        const mine = me?.color ?? 0;
        const swatches = h('div', { class: 'swatches' });
        for (let c = 0; c < SIDE_CSS.length; c++) {
          const takenBy = v.players.some((p) => p.slot !== v.slot && p.color === c);
          swatches.append(h('button', {
            class: `swatch${c === mine ? ' on' : ''}`, style: `background:${SIDE_CSS[c]}`, 'aria-label': colorName(c),
            disabled: takenBy || undefined, onclick: () => handlers.mpColor(c),
          }));
        }
        body.push(h('div', { class: 'colorrow' }, h('div', { class: 'plabel', text: t('mp.vest') }), swatches));
      }
      if (!v.host) {
        const line = (k: string, val: string): HTMLElement => h('div', { class: 'kv' }, h('span', { text: k }), h('b', { text: val }));
        body.push(
          line(t('mp.l.mode'), ctf ? t('menu.ctf') : t('menu.dm')),
          line(t('mp.l.map'), ctf ? ctfMapName(cfg.mapId) : dmMapName(cfg.mapId)),
          h('div', { class: 'help', text: t('mp.wait') }),
        );
      }
    } else {
      const push = (patch: Partial<RoomConfig>): void => { handlers.mpConfig({ ...cfg, ...patch }); };
      const row = (label: string, value: string, change: (d: -1 | 1) => void): HTMLElement => h('div', { class: 'row' },
        h('div', { class: 'label', text: label }),
        h('button', { class: 'btn arrow', text: '◀', onclick: () => change(-1) }),
        h('div', { class: 'value', text: value, role: 'button', onclick: () => change(1) }),
        h('button', { class: 'btn arrow', text: '▶', onclick: () => change(1) }));
      const minBots = v.players.length <= 1 ? 1 : 0;
      const maxBots = MAX_PLAYERS - v.players.length;
      const level = row(t('mp.l.skill'), levelName(cfg.skill), (d) => push({ skill: BOT_LEVELS[cycle(levelIndex(cfg.skill), d, BOT_LEVELS.length)] as RoomConfig['skill'] }));
      body.push(row(t('mp.l.mode'), ctf ? t('menu.ctf') : t('menu.dm'), () => push(ctf ? { mode: 'dm', mapId: 0, fragLimit: 10 } : { mode: 'ctf', mapId: 0, fragLimit: 3 })));
      if (ctf) {
        body.push(
          row(t('mp.l.map'), ctfMapName(cfg.mapId), (d) => push({ mapId: cycle(cfg.mapId, d, 5) })),
          level,
          row(t('mp.l.caps'), none(cfg.fragLimit), (d) => push({ fragLimit: cycle(cfg.fragLimit, d, 10) })),
          h('div', { class: 'help', text: t('mp.ctfbots') }),
        );
      } else {
        body.push(
          row(t('mp.l.map'), dmMapName(cfg.mapId), (d) => push({ mapId: cycle(cfg.mapId, d, 7) })),
          row(t('mp.l.bots'), String(cfg.bots), (d) => push({ bots: minBots + cycle(cfg.bots - minBots, d, maxBots - minBots + 1) })),
          level,
          row(t('mp.l.frags'), none(cfg.fragLimit), (d) => push({ fragLimit: cycle(cfg.fragLimit / 5, d, 11) * 5 })),
        );
      }
    }
    menu.append(win({
      title: t('mp.title'),
      note: `${t('mp.players')} ${v.players.length}/${MAX_PLAYERS}`,
      onBack: handlers.mpLeave,
      bodyClass: 'mp compact',
      tall: true,
      body,
      footer: v.host ? [button(t('mp.start'), handlers.mpStart, 'primary')] : [button(t('mp.leave'), handlers.mpLeave, 'quiet')],
    }));
    open(menu);
  }

  /** Telegram share sheet when available, otherwise the Web Share API / clipboard. */
  function shareRoom(code: string): void {
    const text = t('mp.share.text', { code });
    const url = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/realtournament_bot')}&text=${encodeURIComponent(text)}`;
    const tg = (globalThis as { Telegram?: { WebApp?: { openTelegramLink?(u: string): void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else if (navigator.share) void navigator.share({ text }).catch(() => {});
    else void navigator.clipboard?.writeText(text).catch(() => {});
  }

  /** The scoreboard as its own window (opened from the pause header), with a back arrow. */
  function statsScreen(board: ScoreRow[], back: () => void): void {
    clear(over);
    over.append(win({ title: t('sb.title'), onBack: back, bodyClass: 'pause', body: [h('div', { class: 'psec' }, scoreTable(board))] }));
    open(over);
  }

  function helpScreen(back: () => void, host: HTMLElement): void {
    clear(host);
    const sections: [string, string][] = [
      [t('help.tab.controls'), t('help.controls')], [t('help.tab.pickups'), t('help.pickups')],
      [t('help.tab.dm'), t('help.dm')], [t('help.tab.ctf'), t('help.ctf')],
    ];
    const text = h('div', { class: 'help' });
    const tabs = h('div', { class: 'tabs' });
    const show = (i: number): void => {
      text.textContent = sections[i]![1].replace(/\r/g, '').trim();
      [...tabs.children].forEach((c, j) => c.classList.toggle('hot', i === j));
    };
    sections.forEach(([name], i) => tabs.append(button(name, () => show(i), 'chip')));
    host.append(win({ title: t('menu.help'), onBack: back, body: [tabs, text] }));
    show(0);
    open(host);
  }

  function aboutScreen(canContinue: boolean): void {
    clear(menu);
    menu.append(win({
      title: t('menu.about'),
      onBack: () => mainScreen(canContinue),
      body: [h('div', { class: 'help', text: t('about.text', { build: __BUILD__ }) })],
    }));
    open(menu);
  }

  return {
    showMain: mainScreen,
    showMultiplayer: multiplayerScreen,
    showConnecting: connectingScreen,
    showLobby: lobbyScreen,
    showPause(canOrder, currentOrder, board, note): void {
      clear(over);
      const chip = (text: string, onclick: () => void, cls = ''): HTMLElement => h('button', { class: `btn chip ${cls}`, text, onclick });
      // in team matches the ally orders need the room: the scoreboard hides behind a link in the header
      const folded = canOrder && !!board;
      const body: HTMLElement[] = board && !folded ? [h('div', { class: 'psec' }, scoreTable(board))] : [];
      if (canOrder) {
        const row = h('div', { class: 'prow wrap' });
        for (let i = 0; i < 3; i++) row.append(chip(orderLabel(i), () => { handlers.allyOrder(i as AllyOrder); handlers.resume(); }, i === currentOrder ? 'hot' : ''));
        body.push(h('div', { class: 'psec' }, h('div', { class: 'plabel', text: t('pause.ally') }), row));
      }
      const soundText = (): string => t('pause.sound', { value: onOff(settings.sound) });
      const sound = chip(soundText(), () => {
        settings.sound = !settings.sound;
        sound.textContent = soundText();
        save();
      });
      body.push(h('div', { class: 'prow' }, sound, chip(t('menu.help'), () => helpScreen(() => this.showPause(canOrder, currentOrder, board, note), over))));
      over.append(win({
        title: t('pause.title'),
        onBack: handlers.resume,
        bodyClass: 'pause',
        note,
        headLink: folded ? h('button', { class: 'head-link', text: t('sb.title'), onclick: () => statsScreen(board!, () => this.showPause(canOrder, currentOrder, board, note)) }) : undefined,
        body,
        footer: [button(t('pause.end'), handlers.endGame, 'quiet')],
      }));
      open(over);
      setPausedUi(true);
    },
    showResult(m, online): void {
      clear(over);
      const rows: { color: number; score: number; side: number }[] = [];
      for (let i = 0; i < m.numSides; i++) rows.push({ side: i, score: m.score[i]!, color: m.sideColors[i]! });
      rows.sort((a, b) => b.score - a.score);
      const grid = h('div', { class: 'scores' });
      rows.forEach((r, i) => {
        const name = m.gameMode === 1 ? (r.color === 0 ? t('result.blue') : t('result.red')) : (online?.names[r.side] || colorName(r.color));
        const you = r.side === (online ? m.fighters[online.slot]?.side ?? 0 : 0) ? ` ${t('result.you')}` : '';
        const cls = i === 0 ? 'first' : '';
        grid.append(
          h('div', { class: cls }, h('span', { class: 'dot', style: `background:${SIDE_CSS[r.color] ?? '#fff'}` }), h('span', { text: `${name}${you}` })),
          h('div', { class: cls, text: String(r.score) }),
        );
      });
      const body: HTMLElement[] = [grid];
      body.push(scoreTable(scoreboard(m, online?.slot ?? 0, online?.names ?? [])));
      setPausedUi(false);
      over.append(win({ title: t('result.title'), body, footer: [button(t('common.menu'), handlers.endGame, 'primary')], small: true }));
      open(over);
      over.classList.add('plain');
    },
    hide(): void {
      setPausedUi(false);
      menu.classList.remove('open');
      over.classList.remove('open');
      isOpen = false;
    },
    get open(): boolean {
      return isOpen;
    },
    get paused(): boolean {
      return paused;
    },
    setPauseButton(on): void {
      pauseBtn.classList.toggle('on', on);
    },
    setRotateOverlay(on): void {
      rotate.classList.toggle('on', on);
    },
  };
}
