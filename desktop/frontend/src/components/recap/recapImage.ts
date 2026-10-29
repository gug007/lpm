import {
  RECAP_DEFAULT_THEME,
  RECAP_FONT,
  RECAP_GLOW_DEG,
  RECAP_HOURS_LABEL,
  RECAP_LAYOUT as L,
  RECAP_THEMES,
  RECAP_TOKENS_LABEL,
  type RecapPalette,
  type RecapTheme,
} from "./recapCardTheme";
import { MARK_DOT, MARK_ORIGIN, MARK_RINGS, MARK_SIZE } from "./recapMarkShape";
import { mixText, type RecapView } from "./weeklyRecapModel";

// The card drawn as an image, the way WeeklyRecapCard lays it out, at twice
// the size for sharp text on any screen.
const SCALE = 2;
const MARK_BOX = 29;
const MARK_GLYPH = 17;

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px ${RECAP_FONT}`;
  // Only the big numbers are tracked in, as on the card.
  if ("letterSpacing" in ctx) ctx.letterSpacing = size >= L.hoursSize ? `${L.heroTracking * size}px` : "0px";
}

/** Where the baseline sits in a line box of `line` px, as CSS places it. */
function baseline(ctx: Ctx, line: number): number {
  const m = ctx.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return (line - (ascent + descent)) / 2 + ascent;
}

function text(ctx: Ctx, value: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  return ctx.measureText(value).width;
}

function fit(ctx: Ctx, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Item {
  value: string;
  size: number;
  weight: number;
  color: string;
}

/** The hero line, wrapping like the card's flex row; returns its height. */
function hero(ctx: Ctx, y: number, items: Item[], draw: boolean): number {
  const gap = 12;
  font(ctx, L.heroSize, 800);
  const big = baseline(ctx, L.heroSize);
  font(ctx, L.bodySize);
  const smallLine = L.bodySize * 1.2;
  const small = baseline(ctx, smallLine);
  let x = L.padX;
  let lineTop = y;
  let lineHeight: number = L.heroSize;
  let first = true;
  for (const item of items) {
    font(ctx, item.size, item.weight);
    const width = ctx.measureText(item.value).width;
    if (!first && x + gap + width > L.width - L.padX) {
      lineTop += lineHeight;
      lineHeight = smallLine;
      x = L.padX;
    } else if (!first) {
      x += gap;
    }
    const at = lineTop === y ? y + big : lineTop + small;
    if (draw) text(ctx, item.value, x, at, item.color);
    x += width;
    first = false;
  }
  return lineTop - y + lineHeight;
}

/** A big number over its label; returns its height. */
function stacked(
  ctx: Ctx,
  C: RecapPalette,
  y: number,
  value: string,
  label: string,
  size: number,
  draw: boolean,
): number {
  if (draw) {
    font(ctx, size, 800);
    text(ctx, value, L.padX, y + baseline(ctx, size), C.strong);
    font(ctx, L.bodySize);
    text(ctx, label, L.padX, y + size + L.stackGap + baseline(ctx, L.labelLine), C.soft);
  }
  return size + L.stackGap + L.labelLine;
}

const TILES_HEIGHT = 2 + 2 * L.tilePadY + L.tileValueLine + L.tileLabelLine;

function tiles(ctx: Ctx, C: RecapPalette, y: number, view: RecapView): number {
  const cells = view.tiles.map((tile) => ({
    value: tile.value,
    size: 24,
    color: C.strong,
    label: [[tile.label, C.muted]],
  }));
  if (view.lines) {
    cells.push({
      value: view.lines.added,
      size: 20,
      color: C.green,
      label: [[view.lines.removed, C.red], [" lines", C.muted]],
    });
  }
  const width = (L.width - 2 * L.padX - (cells.length - 1) * L.tileGap) / cells.length;
  cells.forEach((cell, i) => {
    const x = L.padX + i * (width + L.tileGap);
    box(ctx, x + 0.5, y + 0.5, width - 1, TILES_HEIGHT - 1, L.tileRadius);
    ctx.fillStyle = C.tile;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    const left = x + 1 + L.tilePadX;
    const top = y + 1 + L.tilePadY;
    font(ctx, cell.size, 800);
    text(ctx, cell.value, left, top + baseline(ctx, L.tileValueLine), cell.color);
    font(ctx, 13);
    let at = left;
    for (const [part, color] of cell.label) {
      at += text(ctx, part, at, top + L.tileValueLine + baseline(ctx, L.tileLabelLine), color);
    }
  });
  return TILES_HEIGHT;
}

function agents(ctx: Ctx, C: RecapPalette, y: number, view: RecapView) {
  font(ctx, L.rowSize);
  const line = fit(ctx, mixText(view.mix), L.width - 2 * L.padX);
  text(ctx, line, L.padX, y + baseline(ctx, L.rowLine), C.soft);
}

function mark(ctx: Ctx, C: RecapPalette, y: number) {
  font(ctx, 14);
  const label = "lpm.cx";
  const right = L.width - L.padX;
  const textWidth = ctx.measureText(label).width;
  text(ctx, label, right, y + baseline(ctx, L.footerLine), C.muted, "right");
  const x = right - textWidth - 8 - MARK_BOX;
  const top = y + (L.footerLine - MARK_BOX) / 2;
  box(ctx, x + 0.5, top + 0.5, MARK_BOX - 1, MARK_BOX - 1, 7);
  ctx.fillStyle = C.markGround;
  ctx.fill();
  ctx.strokeStyle = C.markBorder;
  ctx.stroke();
  const unit = MARK_GLYPH / MARK_SIZE;
  const ox = x + (MARK_BOX - MARK_GLYPH) / 2;
  const oy = top + (MARK_BOX - MARK_GLYPH) / 2;
  const at = (v: number) => (v - MARK_ORIGIN) * unit;
  ctx.beginPath();
  ctx.arc(ox + at(MARK_DOT.x), oy + at(MARK_DOT.y), MARK_DOT.r * unit, 0, Math.PI * 2);
  ctx.fillStyle = C.markDot;
  ctx.fill();
  ctx.strokeStyle = C.markRing;
  for (const ring of MARK_RINGS) {
    ctx.lineWidth = ring.stroke * unit;
    ctx.beginPath();
    ctx.arc(ox + at(ring.x), oy + at(ring.y), ring.r * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function heroItems(view: RecapView, C: RecapPalette): Item[] {
  return [
    { value: view.hours, size: L.heroSize, weight: 800, color: C.strong },
    { value: RECAP_HOURS_LABEL, size: L.bodySize, weight: 400, color: C.soft },
  ];
}

/** Lays the card out once to learn its height, then draws it. */
function paint(ctx: Ctx, C: RecapPalette, view: RecapView, draw: boolean): number {
  let y = L.padTop;
  if (draw) {
    font(ctx, L.titleSize, 700);
    text(ctx, view.title, L.padX, y + baseline(ctx, L.headerLine), C.text);
    font(ctx, L.bodySize);
    text(ctx, view.range, L.width - L.padX, y + baseline(ctx, L.headerLine), C.muted, "right");
  }
  y += L.headerLine + L.gap;
  if (view.tokens) {
    y += stacked(ctx, C, y, view.tokens, RECAP_TOKENS_LABEL, L.heroSize, draw) + L.gap;
    y += stacked(ctx, C, y, view.hours, RECAP_HOURS_LABEL, L.hoursSize, draw) + L.gap;
  } else {
    y += hero(ctx, y, heroItems(view, C), draw) + L.gap;
  }
  if (view.tiles.length > 0 || view.lines) {
    y += (draw ? tiles(ctx, C, y, view) : TILES_HEIGHT) + L.gap;
  }
  if (view.mix.length > 0) {
    if (draw) agents(ctx, C, y, view);
    y += L.rowLine + L.gap;
  }
  if (draw) mark(ctx, C, y);
  return y + L.footerLine + L.padBottom;
}

function glow(ctx: Ctx, C: RecapPalette, width: number, height: number) {
  const angle = (RECAP_GLOW_DEG * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  const gradient = ctx.createLinearGradient(
    width / 2 - (dx * length) / 2,
    height / 2 - (dy * length) / 2,
    width / 2 + (dx * length) / 2,
    height / 2 + (dy * length) / 2,
  );
  gradient.addColorStop(0, C.glow);
  gradient.addColorStop(0.55, C.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawRecap(view: RecapView, theme: RecapTheme = RECAP_DEFAULT_THEME): HTMLCanvasElement {
  const C = RECAP_THEMES[theme];
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("This computer can't draw images");
  const height = Math.ceil(paint(measure, C, view, false));
  canvas.width = L.width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  glow(ctx, C, L.width, height);
  paint(ctx, C, view, true);
  return canvas;
}

export function recapImage(view: RecapView, theme: RecapTheme = RECAP_DEFAULT_THEME): Promise<Blob> {
  const canvas = drawRecap(view, theme);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not make the image"))),
      "image/png",
    ),
  );
}
