/** Allows at most `max` events per sliding window of `windowMs`; used per socket so one client cannot flood a room. */
export class RateLimiter {
  private hits: number[] = [];
  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(now: number): boolean {
    const from = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0]! <= from) this.hits.shift();
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}
