// A mini view's size: the card's width and the height of its screen. Each view
// keeps its own, and a newly kept one starts at the size last dragged to.
export interface MiniViewSize {
  width: number;
  height: number;
}

export const MINI_VIEW_DEFAULT_SIZE: MiniViewSize = { width: 320, height: 96 };
export const MINI_VIEW_MIN_SIZE: MiniViewSize = { width: 240, height: 57 };

const KEY = "lpm-mini-view-size";
const LINE_HEIGHT = 15;
const PADDING = 12;

/** Lines of output that fill a screen this tall, the top one partly hidden. */
export function miniViewRows(height: number): number {
  return Math.max(1, Math.ceil((height - PADDING) / LINE_HEIGHT));
}

export function rememberedMiniViewSize(): MiniViewSize {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      typeof stored?.width === "number" &&
      typeof stored?.height === "number" &&
      stored.width >= MINI_VIEW_MIN_SIZE.width &&
      stored.height >= MINI_VIEW_MIN_SIZE.height
    ) {
      return { width: stored.width, height: stored.height };
    }
  } catch {
    /* storage may be disabled or hold something else */
  }
  return MINI_VIEW_DEFAULT_SIZE;
}

export function rememberMiniViewSize(size: MiniViewSize): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(size));
  } catch {
    /* storage may be full or disabled */
  }
}
