// CSS pixels per PDF point: a page drawn at this scale is its printed size.
export const PDF_TO_CSS = 96 / 72;

// 100% fits a page to the viewer's width, up to a quarter over its printed
// size: a wide window would otherwise blow a receipt up past reading distance.
const MAX_FIT = PDF_TO_CSS * 1.25;

// The pixels one page's canvas may hold (4 bytes each), as in pdf.js's own
// viewer: enough for a sharp page at 250%, without a tall page at that zoom
// costing a gigabyte.
const MAX_CANVAS_PIXELS = 2 ** 25;

export function fitScale(pageWidth: number, available: number): number {
  if (pageWidth <= 0 || available <= 0) return PDF_TO_CSS;
  return Math.min(available / pageWidth, MAX_FIT);
}

// Device pixels per CSS pixel for a page's canvas: the screen's own density,
// lowered as far as that limit needs for a page zoomed very large.
export function outputScale(width: number, height: number, dpr: number): number {
  const cap = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height));
  return Math.min(dpr > 0 ? dpr : 1, cap);
}
