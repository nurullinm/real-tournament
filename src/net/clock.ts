const TICK_MS = 60;
/** never predict further than this many ticks (about 0.7 s): beyond it the guess is mostly wrong */
export const MAX_AHEAD_TICKS = 12;

/**
 * Where the local simulation should be. The server runs tick n when the player's inputs have to be in; an input sent now
 * arrives after about half the round trip, so the local (predicted) simulation runs `rtt` ahead of the newest tick we
 * have heard of, plus a tick of margin for jitter.
 */
export class TickClock {
  /** smoothed round-trip time in ms */
  rtt = 100;
  private latestTick = 0;
  private latestAt = 0;

  onTick(n: number, now: number): void {
    if (n > this.latestTick) { this.latestTick = n; this.latestAt = now; }
  }

  onPong(sentAt: number, now: number): void {
    const sample = Math.max(0, now - sentAt);
    this.rtt = this.rtt * 0.7 + sample * 0.3;
  }

  /** the tick the predicted simulation should have reached at time `now` */
  target(now: number): number {
    const ahead = (now - this.latestAt + this.rtt) / TICK_MS + 1;
    return this.latestTick + Math.min(MAX_AHEAD_TICKS, Math.max(0, Math.floor(ahead)));
  }
}
