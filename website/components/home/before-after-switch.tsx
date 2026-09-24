"use client";

import { useState, type ReactNode } from "react";

// The phone layout: dragging a line sideways fights the page's scroll, so a
// two-way switch swaps the pictures instead. They share one stage, so the Claude
// prompt stays in place across the fade.
type Side = "before" | "after";

const OPTIONS: { side: Side; label: string }[] = [
  { side: "before", label: "Before" },
  { side: "after", label: "After" },
];

const LAYER = "absolute inset-0 transition-[opacity,visibility] duration-[260ms] ease-out motion-reduce:transition-none";

export function BeforeAfterSwitch({
  before,
  after,
  windows,
  counts,
}: {
  before: ReactNode;
  after: ReactNode;
  /** Short window counts for the switch, e.g. "8 windows". */
  windows: Record<Side, string>;
  counts: Record<Side, ReactNode>;
}) {
  const [side, setSide] = useState<Side>("before");
  return (
    <div className="mx-auto flex max-w-[30rem] flex-col gap-3.5">
      <div
        role="group"
        aria-label="Picture to show"
        className="grid grid-cols-2 gap-0.5 rounded-full bg-gray-100 p-[3px] ring-1 ring-inset ring-gray-200 dark:bg-gray-800/60 dark:ring-white/10"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.side}
            type="button"
            aria-pressed={side === o.side}
            onClick={() => setSide(o.side)}
            className="h-[38px] rounded-full text-[13px] font-semibold text-gray-600 transition-colors aria-pressed:bg-white aria-pressed:text-gray-900 aria-pressed:shadow-[0_0_0_1px_rgba(229,231,235,1),0_1px_3px_rgba(0,0,0,0.12)] motion-reduce:transition-none dark:text-gray-300 dark:aria-pressed:bg-[#2e2e2e] dark:aria-pressed:text-white dark:aria-pressed:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
          >
            {o.label} <span className="font-normal">{windows[o.side]}</span>
          </button>
        ))}
      </div>
      <div className="@container">
        <div className="relative h-[42em] overflow-hidden rounded-[14px] text-[calc(100cqw/39)] ring-1 ring-black/[0.06] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] dark:ring-white/10 dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
          <div className={`${LAYER} ${side === "before" ? "" : "invisible opacity-0"}`}>{before}</div>
          <div className={`${LAYER} ${side === "after" ? "" : "invisible opacity-0"}`}>{after}</div>
        </div>
      </div>
      <p aria-live="polite" className="text-center">
        {counts[side]}
      </p>
    </div>
  );
}
