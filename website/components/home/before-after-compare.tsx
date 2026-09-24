"use client";

import { useRef, type ReactNode } from "react";
import { MoveHorizontal } from "lucide-react";
import { MAX, MIN, useSplitSlider } from "./before-after-slider";

// One desk, two pictures laid out on the same spots: dragging the line trades
// each window for its place in lpm, and the buried Claude prompt comes to the
// front where it lay. The stage sets 1em to 1% of its width, so the drawings
// scale with the column instead of by breakpoint.
const STAGE =
  "relative isolate h-[47.5em] cursor-ew-resize touch-pan-y overflow-hidden rounded-2xl text-[1cqw] ring-1 ring-black/[0.06] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] dark:ring-white/10 dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]";
const END =
  "absolute top-3 z-[7] h-8 rounded-full bg-white/90 px-3.5 text-[13px] font-semibold text-gray-900 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_2px_8px_-2px_rgba(15,23,42,0.2)] transition-colors hover:bg-white aria-pressed:bg-gray-900 aria-pressed:text-white dark:bg-[#111]/80 dark:text-gray-200 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)] dark:hover:bg-[#1a1a1a] dark:aria-pressed:bg-gray-100 dark:aria-pressed:text-[#111] motion-reduce:transition-none";

function valueText(n: number) {
  if (n >= MAX) return "Your Mac today only";
  if (n <= MIN) return "lpm only";
  return `${n}% your Mac today, ${100 - n}% lpm`;
}

export function BeforeAfterCompare({
  before,
  after,
  describedBy,
}: {
  before: ReactNode;
  after: ReactNode;
  describedBy: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { split, dragging, stageHandlers, knobHandlers, snap } = useSplitSlider(stageRef);
  const n = Math.round(split);
  return (
    <div className="@container">
      <div
        ref={stageRef}
        className={`${STAGE} ${dragging ? "cursor-grabbing select-none" : ""}`}
        {...stageHandlers}
      >
        {before}
        <div className="absolute inset-0 z-[1]" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          {after}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-[5] -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.14),0_0_16px_rgba(15,23,42,0.2)]"
          style={{ left: `${split}%` }}
        />
        {/* The knob rides the bottom edge, in the desk margin under both
            pictures, so it never covers either of them. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Compare your Mac today with lpm"
          aria-describedby={describedBy}
          aria-orientation="horizontal"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={n}
          aria-valuetext={valueText(n)}
          className={`absolute bottom-3 z-[6] inline-flex h-9 -translate-x-1/2 touch-none select-none items-center gap-1.5 whitespace-nowrap rounded-full bg-white pl-[11px] pr-3.5 text-[13px] font-semibold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_8px_20px_-6px_rgba(0,0,0,0.45)] ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ left: `${split}%` }}
          {...knobHandlers}
        >
          <MoveHorizontal aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
          Drag
        </div>
        <button
          type="button"
          aria-pressed={split >= MAX - 0.5}
          onClick={() => snap(MAX)}
          className={`${END} left-3`}
        >
          Before
        </button>
        <button
          type="button"
          aria-pressed={split <= MIN + 0.5}
          onClick={() => snap(MIN)}
          className={`${END} right-3`}
        >
          After
        </button>
      </div>
    </div>
  );
}
