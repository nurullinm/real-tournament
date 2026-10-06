export interface ScaleInfo {
  /** physical pixels per logical (original) pixel; always an integer >= 1 */
  scale: number;
  /** logical view size in original pixels */
  viewW: number;
  viewH: number;
  viewTilesW: number;
  viewTilesH: number;
}

/**
 * Integer pixel scale so that about `targetTilesH` tiles fit vertically.
 * Rounded (not floored) so the iPhone 17 Pro Max landscape view (956x440 pt, dpr 3) lands on 6x ≈ 30x14 tiles.
 */
export function computeScale(cssW: number, cssH: number, dpr: number, tileSize: number, targetTilesH: number): ScaleInfo {
  const physW = Math.round(cssW * dpr);
  const physH = Math.round(cssH * dpr);
  const scale = Math.max(1, Math.round(physH / (targetTilesH * tileSize)));
  const viewW = Math.ceil(physW / scale);
  const viewH = Math.ceil(physH / scale);
  return { scale, viewW, viewH, viewTilesW: viewW / tileSize, viewTilesH: viewH / tileSize };
}
