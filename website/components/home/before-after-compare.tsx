"use client";

import { useState } from "react";
import { MoveHorizontal } from "lucide-react";
import { IN_THE_DOCK, STAGE_H, WINDOWS } from "./before-after-data";
import { AfterDescription, BeforeDescription } from "./before-after-descriptions";
import { AGENT_ROW_COUNT, LpmReplica, PROJECT_COUNT } from "./before-after-replica";
import { PileWindowCard } from "./before-after-window";

// Both pictures sit on one footprint in the middle of one stage, so dragging
// the line reveals a single window occupying what the whole pile fought over.
// The pile keeps its drawn window sizes but scatters across a wider box than
// the 44em it was laid out in: its offsets are percentages of the box, so a
// wider box spreads the windows without resizing them, and the api window
// still lands on the permission prompt it is there to bury.
const FOOTPRINT = "w-[72em] h-[var(--stage-h)]";
// 1em = one design pixel / 10, following the stage's width so the picture
// fills a wide screen and still fits beside a tablet's gutters.
const SCALE = "text-[clamp(0.55rem,1.15cqw,0.8rem)]";
const LABEL =
  "absolute top-[1.4em] z-10 rounded-[0.5em] px-[1em] py-[0.5em] text-[1.05em] font-bold uppercase tracking-[0.25em]";
const NOTE = "absolute bottom-[1.4em] z-10 font-mono text-[1.05em] tracking-tight";

export function BeforeAfterCompare() {
  const [split, setSplit] = useState(55);
  return (
    <div className="@container">
      <div
        className={`relative overflow-hidden rounded-2xl ring-1 ring-black/[0.06] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] dark:ring-white/10 dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] ${SCALE}`}
        style={
          {
            "--split": `${split}%`,
            "--stage-h": `${STAGE_H / 10}em`,
          } as React.CSSProperties
        }
      >
        <div
          aria-hidden="true"
          data-on-dark
          className="relative flex h-[calc(var(--stage-h)+8em)] items-center justify-center bg-[#111111]"
        >
          <div className={FOOTPRINT}>
            <LpmReplica />
          </div>
          <span className={`${LABEL} right-[1.4em] bg-white/[0.12] text-white`}>
            With lpm
          </span>
          <p className={`${NOTE} right-[1.6em] text-[#9a9a9a]`}>
            1 window · {PROJECT_COUNT} projects · {AGENT_ROW_COUNT} agents
          </p>
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#e3e9f2,#b8c5d9)] dark:bg-[linear-gradient(135deg,#3b4454,#1e232c)]"
          style={{ clipPath: "inset(0 calc(100% - var(--split)) 0 0)" }}
        >
          <div className={`relative ${FOOTPRINT}`}>
            {WINDOWS.map((win, i) => (
              <PileWindowCard key={win.key} win={win} z={i + 1} />
            ))}
          </div>
          <span className={`${LABEL} left-[1.4em] bg-white/90 text-gray-900`}>
            Your Mac today
          </span>
          <p className={`${NOTE} left-[1.6em] text-red-700 dark:text-red-300`}>
            {WINDOWS.length} windows · {IN_THE_DOCK} more in the dock
          </p>
        </div>

        <BeforeDescription />
        <AfterDescription />
        {/* The whole stage is the slider's track, so a drag anywhere moves the
            line; the input itself stays invisible and the handle below draws
            its position. */}
        <input
          id="before-after-split"
          type="range"
          min={4}
          max={96}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Drag to compare your Mac today with lpm"
          aria-valuetext={`${split} percent your Mac today, ${100 - split} percent with lpm`}
          className="peer absolute inset-0 z-30 m-0 h-full w-full cursor-ew-resize opacity-0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)] peer-focus-visible:bg-[#60a5fa]"
          style={{ left: "var(--split)" }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
            <MoveHorizontal className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </div>
      </div>
      <p className="mt-4 text-center text-[13px] text-gray-500 dark:text-gray-400">
        Drag the line.
      </p>
    </div>
  );
}
