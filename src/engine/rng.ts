/** Seeded PRNG exposing the original's U_Rnd / U_RndBinary call shapes (mulberry32). */
export interface Rng {
  /** uniform in [0, 1) */
  next(): number;
  /** uniform signed 32-bit integer, like java.util.Random.nextInt() */
  nextInt(): number;
  /** U_Rnd(n): integer in [0, n) */
  int(n: number): number;
  /** U_Rnd(a, b): integer in [a, b] */
  range(a: number, b: number): number;
  /** U_RndBinary(mask): nextInt() & mask */
  bits(mask: number): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const raw = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const nextInt = (): number => raw() | 0;
  return {
    next: () => raw() / 4294967296,
    nextInt,
    int: (n) => (nextInt() & 0x7fffffff) % n,
    range: (a, b) => (nextInt() & 0x7fffffff) % (b - a + 1) + a,
    bits: (mask) => nextInt() & mask,
  };
}
