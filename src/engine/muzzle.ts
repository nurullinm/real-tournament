import type { CharsData } from '../assets/types';

/** Port of the muzzle tables derived in G_Init: part with sub-image 10 marks the gun barrel in each of the first 37 frames. */
export function computeMuzzle(chars: CharsData): { muzzleX: number[]; muzzleY: number[] } {
  const muzzleX: number[] = new Array<number>(191).fill(0);
  const muzzleY: number[] = new Array<number>(191).fill(0);
  for (let i = 0; i < 37; i++) {
    let p = chars.frameStart[i]!;
    for (let part = chars.parts[p]; part && part.sub >= 0; part = chars.parts[++p]) {
      if (part.sub === 10) {
        muzzleX[i] = Math.min(-part.x, 15);
        muzzleY[i] = part.y + 1;
      }
    }
  }
  return { muzzleX, muzzleY };
}
