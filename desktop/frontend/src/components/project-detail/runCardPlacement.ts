import { formatElapsed } from "../backgroundRunToastText";
import type { ActionDone } from "../../hooks/actionRunCapture";

export const RUN_CARD_WIDTH = 380;
// A terminal command's card: as wide as its terminal allows, up to this.
const CORNER_CARD_MAX_WIDTH = 720;
// How long a passed run's card stays up before closing itself.
export const RUN_CARD_AUTO_CLOSE_MS = 4000;
// The error a run ends with when it was stopped from its card.
export const RUN_STOPPED_ERROR = "stopped";

export type RunState = "running" | "passed" | "stopped" | "failed";

export function runState(done: ActionDone | null): RunState {
  if (done === null) return "running";
  if (done.success) return "passed";
  return done.error === RUN_STOPPED_ERROR ? "stopped" : "failed";
}

const GAP = 8;
const EDGE = 12;
// Under the header, where the header's own actions are.
const FALLBACK_TOP = 56;

export interface RunCardPlacement {
  left: number;
  width?: number;
  top?: number;
  bottom?: number;
}

interface Box {
  top: number;
  bottom: number;
  right: number;
}

/** Where a run's card opens: right-aligned under the button that started it,
 *  or over it when the button sits in the lower half (the footer). A run with
 *  no button on screen, like one a phone started, opens under the header. */
export function placeRunCard(anchor: Box | null, view: { width: number; height: number }): RunCardPlacement {
  const maxLeft = Math.max(EDGE, view.width - EDGE - RUN_CARD_WIDTH);
  if (!anchor) return { top: FALLBACK_TOP, left: maxLeft };
  const left = Math.min(Math.max(anchor.right - RUN_CARD_WIDTH, EDGE), maxLeft);
  return anchor.top < view.height / 2
    ? { top: anchor.bottom + GAP, left }
    : { bottom: view.height - anchor.top + GAP, left };
}

/** Inside a terminal's top right corner, over its output, as wide as the
 *  terminal leaves room for. */
export function placeInCorner(
  area: { top: number; right: number; width: number } | null,
  view: { width: number; height: number },
): RunCardPlacement {
  const fits = Math.max(RUN_CARD_WIDTH, view.width - 2 * EDGE);
  const width = Math.min(CORNER_CARD_MAX_WIDTH, fits, Math.max(RUN_CARD_WIDTH, (area?.width ?? 0) - 2 * GAP));
  const maxLeft = Math.max(EDGE, view.width - EDGE - width);
  if (!area) return { top: FALLBACK_TOP, left: maxLeft, width };
  return { top: area.top + GAP, left: Math.min(Math.max(area.right - GAP - width, EDGE), maxLeft), width };
}

export function findRunAnchor(runKey: string): DOMRect | null {
  for (const el of document.querySelectorAll(`[data-action-run="${CSS.escape(runKey)}"]`)) {
    if (el.getClientRects().length > 0) return el.getBoundingClientRect();
  }
  return null;
}

/** "1.2 s" for a quick run, "45s" and "2m 5s" beyond ten seconds. */
export function runDuration(ms: number): string {
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
  return formatElapsed(ms);
}
