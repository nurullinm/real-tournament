import type { AllyOrder } from '../bots';
import type { Match } from '../engine/types';
import { clear, h } from './dom';
import {
  BOT_NAMES, COLOR_NAMES, CTF_MAP_NAMES, DM_MAP_NAMES, SKILL_NAMES, cycle, type GameSettings,
} from './settings';

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

export interface HelpText {
  controls: string;
  pickups: string;
  deathmatch: string;
  ctf: string;
}

const ORDER_LABELS = ['Defend the base', 'Take their flag!', 'Freelance!'] as const;
const SIDE_CSS = ['#3a5bff', '#e03030', '#25b25a', '#d9b800'];

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

export function createUi(root: HTMLElement, settings: GameSettings, help: HelpText, handlers: UiHandlers): Ui {
  const menu = h('div', { class: 'ui menu' });
  const over = h('div', { class: 'ui over' });
  let paused = false;
  const pauseBtn = h('button', { id: 'pause', 'aria-label': 'Pause', onclick: () => (paused ? handlers.resume() : handlers.pause()) });
  /** the pause button doubles as Resume while the pause menu is open, in the same corner */
  const setPausedUi = (on: boolean): void => {
    paused = on;
    pauseBtn.setAttribute('aria-label', on ? 'Resume' : 'Pause');
    pauseBtn.classList.toggle('resume', on);
  };
  const rotate = h('div', { class: 'rotate' }, h('div', { class: 'phone' }), h('div', { text: 'Rotate your phone' }), h('div', { text: 'Real Tournament is played in landscape', style: 'font-size:14px;color:#9ba0d0;font-weight:500' }));
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
    if (p.onBack) head.append(h('button', { class: 'back', 'aria-label': 'Back', onclick: p.onBack }));
    head.append(h('h2', { text: p.title }));
    const el = h('div', { class: `win${p.small ? ' small' : ''}` }, head, h('div', { class: 'win-body' }, ...p.body));
    if (p.footer?.length) el.append(h('div', { class: 'win-foot' }, ...p.footer));
    return el;
  }

  function selector(label: string, value: () => string, change: (dir: -1 | 1) => void): HTMLElement {
    const val = h('div', { class: 'value', text: value(), role: 'button' });
    const update = (dir: -1 | 1) => () => { change(dir); val.textContent = value(); save(); };
    val.addEventListener('click', update(1));
    return h('div', { class: 'row' }, h('div', { class: 'label', text: label }),
      h('button', { class: 'btn arrow', text: '◀', 'aria-label': `${label} previous`, onclick: update(-1) }),
      val,
      h('button', { class: 'btn arrow', text: '▶', 'aria-label': `${label} next`, onclick: update(1) }));
  }
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement =>
    selector(label, () => (get() ? 'On' : 'Off'), () => set(!get()));
  const button = (text: string, onclick: () => void, cls = ''): HTMLElement => h('button', { class: `btn ${cls}`, text, onclick });

  function mainScreen(canContinue: boolean): void {
    clear(menu);
    const col = h('div', { class: 'col' });
    if (canContinue) col.append(button('Continue game', handlers.continueGame, 'primary'));
    col.append(
      button('Deathmatch', () => setupScreen('dm', canContinue), canContinue ? '' : 'primary'),
      button('Capture the flag', () => setupScreen('ctf', canContinue)),
      button('Settings', () => settingsScreen(() => mainScreen(canContinue))),
      button('Help', () => helpScreen(() => mainScreen(canContinue), menu)),
      button('About', () => aboutScreen(canContinue)),
    );
    col.append(h('div', { class: 'build', text: `build ${__BUILD__}` }));
    menu.append(col);
    open(menu);
  }

  function setupScreen(mode: 'dm' | 'ctf', canContinue: boolean): void {
    clear(menu);
    const body: HTMLElement[] = [];
    if (mode === 'dm') {
      const o = settings.dm;
      body.push(
        selector('Map', () => DM_MAP_NAMES[o.map]!, (d) => { o.map = cycle(o.map, d, DM_MAP_NAMES.length); }),
        selector('Skill', () => SKILL_NAMES[o.skill]!, (d) => { o.skill = cycle(o.skill, d, 5); }),
        selector('Bots', () => BOT_NAMES[o.bots]!, (d) => { o.bots = cycle(o.bots, d, 4); }),
        selector('Frag limit', () => (o.fragStep === 0 ? 'None' : String(o.fragStep * 5)), (d) => { o.fragStep = cycle(o.fragStep, d, 9); }),
        selector('Color', () => COLOR_NAMES[o.color]!, (d) => { o.color = cycle(o.color, d, 4); }),
        toggle('No medikits', () => o.noMedikits, (v) => { o.noMedikits = v; }),
      );
    } else {
      const o = settings.ctf;
      body.push(
        selector('Map', () => CTF_MAP_NAMES[o.map]!, (d) => { o.map = cycle(o.map, d, CTF_MAP_NAMES.length); }),
        selector('Skill', () => SKILL_NAMES[o.skill]!, (d) => { o.skill = cycle(o.skill, d, 5); }),
        selector('Teams', () => (o.team ? '2 vs 2' : 'Solo'), () => { o.team = !o.team; }),
        selector('Flag limit', () => (o.flagLimit === 0 ? 'None' : String(o.flagLimit)), (d) => { o.flagLimit = cycle(o.flagLimit, d, 10); }),
        selector('Team color', () => COLOR_NAMES[o.color]!, (d) => { o.color = cycle(o.color, d, 2); }),
        toggle('No medikits', () => o.noMedikits, (v) => { o.noMedikits = v; }),
      );
    }
    menu.append(win({
      title: mode === 'dm' ? 'Deathmatch' : 'Capture the flag',
      onBack: () => mainScreen(canContinue),
      body,
      footer: [button('Start!', () => handlers.start(mode), 'primary')],
    }));
    open(menu);
  }

  function settingsScreen(back: () => void): void {
    clear(menu);
    menu.append(win({
      title: 'Settings',
      onBack: back,
      body: [
        toggle('Sound', () => settings.sound, (v) => { settings.sound = v; }),
        toggle('Violence', () => settings.violence, (v) => { settings.violence = v; }),
      ],
    }));
    open(menu);
  }

  function helpScreen(back: () => void, host: HTMLElement): void {
    clear(host);
    const sections: [string, string][] = [['Controls', help.controls], ['Pickups', help.pickups], ['Deathmatch', help.deathmatch], ['Capture the flag', help.ctf]];
    const text = h('div', { class: 'help' });
    const tabs = h('div', { class: 'tabs' });
    const show = (i: number): void => {
      text.textContent = sections[i]![1].replace(/\r/g, '').trim();
      [...tabs.children].forEach((c, j) => c.classList.toggle('hot', i === j));
    };
    sections.forEach(([name], i) => tabs.append(button(name, () => show(i), 'chip')));
    host.append(win({ title: 'Help', onBack: back, body: [tabs, text] }));
    show(0);
    open(host);
  }

  function aboutScreen(canContinue: boolean): void {
    clear(menu);
    menu.append(win({
      title: 'About',
      onBack: () => mainScreen(canContinue),
      body: [h('div', { class: 'help', text: `Real Tournament (2012)\nPublisher: RMG\nDeveloper: Qplaze\n\nBrowser port for Telegram.\nBuild ${__BUILD__}` })],
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
        ORDER_LABELS.forEach((label, i) => row.append(chip(label, () => { handlers.allyOrder(i as AllyOrder); handlers.resume(); }, i === currentOrder ? 'hot' : '')));
        body.push(h('div', { class: 'plabel', text: 'Ally' }), row);
      }
      const sound = chip(`Sound: ${settings.sound ? 'On' : 'Off'}`, () => {
        settings.sound = !settings.sound;
        sound.textContent = `Sound: ${settings.sound ? 'On' : 'Off'}`;
        save();
      });
      body.push(h('div', { class: 'prow' }, sound, chip('Help', () => helpScreen(() => this.showPause(canOrder, currentOrder), over))));
      over.append(win({
        title: 'Game paused',
        onBack: handlers.resume,
        body,
        footer: [button('End game', handlers.endGame, 'quiet')],
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
        const name = m.gameMode === 1 ? (r.color === 0 ? 'Blue team' : 'Red team') : COLOR_NAMES[r.color]!;
        const you = r.side === 0 ? ' (you)' : '';
        const cls = i === 0 ? 'first' : '';
        grid.append(
          h('div', { class: cls }, h('span', { class: 'dot', style: `background:${SIDE_CSS[r.color] ?? '#fff'}` }), h('span', { text: `${name}${you}` })),
          h('div', { class: cls, text: String(r.score) }),
        );
      });
      setPausedUi(false);
      over.append(win({ title: 'Match result', body: [grid], footer: [button('Menu', handlers.endGame, 'primary')], small: true }));
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
