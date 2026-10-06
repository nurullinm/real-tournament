import { parseChars } from './chars';
import { buildSkins } from './skins';
import type { CharsData } from './types';

export interface Sprites {
  tiles: ImageBitmap;
  energy: ImageBitmap;
  /** character/effect sheets m0..m3, indexed by `SubImage.sheet` */
  sheets: ImageBitmap[];
  panel: ImageBitmap;
  bg: ImageBitmap;
  menu: ImageBitmap;
  logo: ImageBitmap;
  title: ImageBitmap;
  selection: ImageBitmap;
  chars: CharsData;
  /** skins[skin][sheet]: sheets with a repainted vest (see assets/skins.ts); missing in tests */
  skins?: ImageBitmap[][];
}

async function image(base: string, name: string): Promise<ImageBitmap> {
  const res = await fetch(`${base}${name}`);
  return createImageBitmap(await res.blob());
}

export async function loadSprites(base = 'original/'): Promise<Sprites> {
  const [tiles, energy, panel, bg, menu, logo, title, selection, ...sheets] = await Promise.all([
    image(base, 'tiles.png'),
    image(base, 'energy.png'),
    image(base, 'panel.png'),
    image(base, 'bg.png'),
    image(base, 'menu.png'),
    image(base, 'logo.png'),
    image(base, 'title.png'),
    image(base, 'selection.png'),
    ...[0, 1, 2, 3].map((i) => image(base, `m${i}.png`)),
  ]);
  const chars = parseChars(new Uint8Array(await (await fetch(`${base}chars`)).arrayBuffer()));
  const skins = await buildSkins(sheets, chars);
  return { tiles, energy, panel, bg, menu, logo, title, selection, sheets, chars, skins };
}
