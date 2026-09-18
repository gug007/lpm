"use client";

import { FOCUS_RING } from "./ui";

const BUTTON = `flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#919191] ${FOCUS_RING}`;

// Reader zoom for a text surface. The review tab sizes its font and the
// Markdown preview scales its page, so the control takes the resolved
// percentage rather than either raw unit.
export function ZoomControl({
  percent,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-[#242424]/70 p-0.5">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        className={BUTTON}
      >
        &#8722;
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset zoom"
        className={`h-6 min-w-[2.75rem] rounded-md px-1 text-[10px] font-medium tabular-nums text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        className={BUTTON}
      >
        +
      </button>
    </div>
  );
}
