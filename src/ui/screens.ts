import type { AllyOrder } from '../bots';
import type { Match } from '../engine/types';
import { botName, colorName, ctfMapName, dmMapName, onLangChange, orderLabel, skillName, t, type LangPref } from '../i18n';
import { clear, h } from './dom';
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
}

const SIDE_CSS = ['#3a5bff', '#e03030', '#25b25a', '#d9b800'];
const LANG_PREFS: readonly LangPref[] = ['auto', 'en', 'ru'];

export interface Ui {
  showMain(canContinue: boolean): void;
  showPause(canOrder: boolean, currentOrder: number): void;
  showResult(m: Match): void;
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
    const el = h('div', { class: `win${p.small ? ' small' : ''}` }, head, h('div', { class: 'win-body' }, ...p.body));
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
      // not available yet: a disabled button
      h('button', { class: 'btn', disabled: true, 'aria-disabled': 'true', text: t('menu.multiplayer') }),
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
    showPause(canOrder, currentOrder): void {
      clear(over);
      const chip = (text: string, onclick: () => void, cls = ''): HTMLElement => h('button', { class: `btn chip ${cls}`, text, onclick });
      const body: HTMLElement[] = [];
      if (canOrder) {
        const row = h('div', { class: 'prow wrap' });
        for (let i = 0; i < 3; i++) row.append(chip(orderLabel(i), () => { handlers.allyOrder(i as AllyOrder); handlers.resume(); }, i === currentOrder ? 'hot' : ''));
        body.push(h('div', { class: 'plabel', text: t('pause.ally') }), row);
      }
      const soundText = (): string => t('pause.sound', { value: onOff(settings.sound) });
      const sound = chip(soundText(), () => {
        settings.sound = !settings.sound;
        sound.textContent = soundText();
        save();
      });
      body.push(h('div', { class: 'prow' }, sound, chip(t('menu.help'), () => helpScreen(() => this.showPause(canOrder, currentOrder), over))));
      over.append(win({
        title: t('pause.title'),
        onBack: handlers.resume,
        body,
        footer: [button(t('pause.end'), handlers.endGame, 'quiet')],
      }));
      open(over);
      setPausedUi(true);
    },
    showResult(m): void {
      clear(over);
      const rows: { color: number; score: number; side: number }[] = [];
      for (let i = 0; i < m.numSides; i++) rows.push({ side: i, score: m.score[i]!, color: m.sideColors[i]! });
      rows.sort((a, b) => b.score - a.score);
      const grid = h('div', { class: 'scores' });
      rows.forEach((r, i) => {
        const name = m.gameMode === 1 ? (r.color === 0 ? t('result.blue') : t('result.red')) : colorName(r.color);
        const you = r.side === 0 ? ` ${t('result.you')}` : '';
        const cls = i === 0 ? 'first' : '';
        grid.append(
          h('div', { class: cls }, h('span', { class: 'dot', style: `background:${SIDE_CSS[r.color] ?? '#fff'}` }), h('span', { text: `${name}${you}` })),
          h('div', { class: cls, text: String(r.score) }),
        );
      });
      setPausedUi(false);
      over.append(win({ title: t('result.title'), body: [grid], footer: [button(t('common.menu'), handlers.endGame, 'primary')], small: true }));
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
