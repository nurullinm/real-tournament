import { describe, expect, it } from 'vitest';
import { createLoop } from '../../src/game/loop';

function harness(hz = 1000 / 60) {
  let cb: ((t: number) => void) | null = null;
  let steps = 0;
  const alphas: number[] = [];
  const loop = createLoop(() => { steps++; }, (a) => { alphas.push(a); }, hz, {
    request: (f) => { cb = f; return 1; },
    cancel: () => { cb = null; },
  });
  const frame = (t: number) => { const f = cb; if (f) f(t); };
  return { loop, frame, get steps() { return steps; }, alphas };
}

describe('createLoop', () => {
  it('runs one tick per 60 ms of real time', () => {
    const h = harness();
    h.loop.start();
    h.frame(1000);
    expect(h.steps).toBe(0);
    h.frame(1060);
    expect(h.steps).toBe(1);
    h.frame(1180);
    expect(h.steps).toBe(3);
  });

  it('carries fractional time and reports interpolation alpha', () => {
    const h = harness();
    h.loop.start();
    h.frame(0);
    h.frame(90);
    expect(h.steps).toBe(1);
    expect(h.alphas.at(-1)).toBeCloseTo(0.5, 5);
    h.frame(120);
    expect(h.steps).toBe(2);
  });

  it('after pause/resume with a 10 s gap runs at most one tick', () => {
    const h = harness();
    h.loop.start();
    h.frame(0);
    h.frame(60);
    const before = h.steps;
    h.loop.pause();
    h.loop.resume();
    h.frame(10_000);
    h.frame(10_060);
    expect(h.steps - before).toBeLessThanOrEqual(1);
  });

  it('never runs more than the per-frame cap after a stall', () => {
    const h = harness();
    h.loop.start();
    h.frame(0);
    h.frame(2000);
    expect(h.steps).toBe(5);
    h.frame(2060);
    expect(h.steps).toBe(6); // the backlog was dropped, not replayed
  });

  it('does nothing while paused and reports its state', () => {
    const h = harness();
    expect(h.loop.running).toBe(false);
    h.loop.start();
    expect(h.loop.running).toBe(true);
    h.loop.pause();
    h.frame(100);
    expect(h.steps).toBe(0);
    expect(h.loop.running).toBe(false);
  });

  it('start() twice does not double the tick rate', () => {
    const h = harness();
    h.loop.start();
    h.loop.start();
    h.frame(0);
    h.frame(60);
    expect(h.steps).toBe(1);
  });
});
