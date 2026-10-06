/** Loudness of an event at (x, y) heard from (lx, ly): full volume nearby, quiet far away, never silent within the map. */
export function eventVolume(lx: number, ly: number, x: number, y: number): number {
  const d = Math.hypot(x - lx, (y - ly) * 1.5);
  return Math.min(1, Math.max(0.12, 1 - d / 420));
}
