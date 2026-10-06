export interface Point {
  x: number;
  y: number;
}

/** The original's camera target in a 176x192 view: player at 58/176 (facing right) or 118/176 (facing left) from the left, 112/192 from the top. */
export function cameraTarget(player: Point, headsLeft: boolean, view: { w: number; h: number }): Point {
  const fx = headsLeft ? 118 / 176 : 58 / 176;
  return { x: Math.round(player.x - view.w * fx), y: Math.round(player.y - (view.h * 112) / 192) };
}

/** Moves the camera towards its target by at most `maxStep` px per axis (original: 5 px/tick horizontally). */
export function followCamera(prev: Point, target: Point, maxStepX: number, maxStepY = Infinity): Point {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
  return {
    x: clamp(target.x, prev.x - maxStepX, prev.x + maxStepX),
    y: clamp(target.y, prev.y - maxStepY, prev.y + maxStepY),
  };
}

/**
 * Keeps the view inside the map. When the map is smaller than the view on an axis the camera is centred on it, so the
 * camera coordinate is negative there (the renderer fills the margin with background).
 */
export function computeCamera(cam: Point, view: { w: number; h: number }, map: { w: number; h: number }): Point {
  const axis = (v: number, viewLen: number, mapLen: number): number =>
    mapLen <= viewLen ? Math.floor((mapLen - viewLen) / 2) : Math.min(Math.max(v, 0), mapLen - viewLen);
  return { x: axis(cam.x, view.w, map.w), y: axis(cam.y, view.h, map.h) };
}
