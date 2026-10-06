export interface LoopDeps {
  request(cb: (t: number) => void): number;
  cancel(id: number): void;
}

export interface Loop {
  start(): void;
  pause(): void;
  resume(): void;
  readonly running: boolean;
}

/**
 * Fixed-timestep loop: `step` runs every 1000/hz ms of real time, `render(alpha)` once per frame
 * with alpha = progress to the next tick for interpolation. After a pause/resume or a long stall the backlog is dropped
 * (no catch-up burst) and at most `maxTicksPerFrame` ticks run per frame.
 */
export function createLoop(
  step: () => void,
  render: (alpha: number) => void,
  hz: number,
  deps: Partial<LoopDeps> = {},
  maxTicksPerFrame = 5,
): Loop {
  const d: LoopDeps = {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (id) => cancelAnimationFrame(id),
    ...deps,
  };
  const tickMs = 1000 / hz;
  let running = false;
  let last: number | null = null;
  let acc = 0;
  let id = 0;

  const frame = (t: number): void => {
    if (!running) return;
    id = d.request(frame);
    if (last !== null) acc += Math.min(Math.max(0, t - last), tickMs * maxTicksPerFrame);
    last = t;
    let n = 0;
    while (running && acc + 1e-6 >= tickMs && n < maxTicksPerFrame) {
      step();
      acc -= tickMs;
      n++;
    }
    if (acc < 0) acc = 0;
    if (n === maxTicksPerFrame) acc = 0;
    render(acc / tickMs);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    last = null;
    acc = 0;
    id = d.request(frame);
  };
  return {
    start,
    pause(): void {
      running = false;
      d.cancel(id);
    },
    resume: start,
    get running(): boolean {
      return running;
    },
  };
}
