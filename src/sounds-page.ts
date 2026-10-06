import { createAudio, type MusicId, type SoundName } from './audio/audio';
import { EFFECT_NAMES } from './audio/synth/effects';
import { MUSIC_IDS, THEMES } from './audio/synth/music';

/** Audition page: every effect and every music loop on a button, to judge the sound on a real device. */
const LABELS: Record<string, string> = {
  laser: 'Лазер', bazooka: 'Базука', explosion: 'Взрыв', saw: 'Пила', spinup: 'Раскрутка пилы', pickup: 'Подбор предмета',
  respawn: 'Возрождение', die: 'Смерть', diehard: 'Тяжёлая смерть', alarm: 'Тревога флага', capture: 'Захват флага', order: 'Приказ союзнику', ammo: 'Подбор патронов (перезарядка)', weapon: 'Подбор оружия (затвор)',
  menu: 'Меню', dm0: 'Дэтматч 1: Два этажа', dm1: 'Дэтматч 2: Царь горы', dm2: 'Дэтматч 3: Безбилетники', dm3: 'Дэтматч 4: Остров свободы',
  dm4: 'Дэтматч 5: Циклодром', dm5: 'Дэтматч 6: Небоскрёб', dm6: 'Дэтматч 7: Негде спрятаться', ctf0: 'Флаг 1: Диверсанты',
  ctf1: 'Флаг 2: Хаос и порядок', ctf2: 'Флаг 3: Две башни', ctf3: 'Флаг 4: Технопарк', ctf4: 'Флаг 5: Магистраль',
};

const audio = createAudio();
audio.init();
const status = document.getElementById('status')!;
let current: string | null = null;
const musicButtons = new Map<string, HTMLButtonElement>();

const button = (id: string, small: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = LABELS[id] ?? id;
  const s = document.createElement('small');
  s.textContent = small;
  b.append(s);
  return b;
};

for (const name of EFFECT_NAMES) {
  const b = button(name, name);
  b.addEventListener('click', async () => {
    await audio.unlock();
    status.textContent = audio.running ? `Играет: ${LABELS[name]}` : 'Звук заблокирован браузером: нажмите ещё раз.';
    // previews ignore the in-game rate limit by waiting a beat between identical sounds
    audio.play(name as SoundName, 1);
  });
  document.getElementById('fx')!.append(b);
}

for (const id of MUSIC_IDS) {
  const t = THEMES[id]!;
  const b = button(id, `${t.bpm} BPM · ${t.scale} · ${Math.round((t.bars * 4 * 60) / t.bpm)} с`);
  b.addEventListener('click', async () => {
    await audio.unlock();
    const stop = current === id;
    current = stop ? null : id;
    audio.playMusic(stop ? null : (id as MusicId));
    musicButtons.forEach((btn, k) => btn.classList.toggle('on', k === current));
    status.textContent = stop ? 'Музыка остановлена' : `Музыка: ${LABELS[id]} (готовится пару секунд)`;
  });
  musicButtons.set(id, b);
  document.getElementById('music')!.append(b);
}
