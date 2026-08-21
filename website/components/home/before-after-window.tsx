import { TerminalLine } from "@/components/terminal-line";
import type { PileWindow } from "./before-after-data";
import { STAGE_H, STAGE_W } from "./before-after-data";

// Every length below is in `em`, and the stage sets 1em = one design pixel /
// 10, so the whole composition scales with one font-size instead of a
// breakpoint per width. See the stage in before-after.tsx.
const em = (px: number) => `${px / 10}em`;

// Unfocused macOS windows show grey lights, which is both what a pile of
// buried terminals actually looks like and how the left half stays free of
// green.
const LIGHTS = "h-[0.7em] w-[0.7em] shrink-0 rounded-full bg-[#4a4a4a]";

// The seam between two overlapping dark windows comes from the ring, not from
// the page behind them, so the pile reads as separate windows in either theme.
const FRAME =
  "overflow-hidden rounded-[0.6em] bg-[#1a1a1a] ring-1 ring-white/10 shadow-[0_1px_0_0_rgba(0,0,0,0.3),0_10px_24px_-10px_rgba(0,0,0,0.35)] dark:ring-white/[0.16] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.8),0_10px_24px_-10px_rgba(0,0,0,0.85)]";

// Below `sm` the scatter collapses into a cascade: each window goes full width
// and is pulled up over the one before it, so a narrow screen never has to hold
// an absolutely positioned, rotated composition.
const CASCADE =
  "relative w-[93%] -mt-[4em] first:mt-0 [rotate:var(--rc)] sm:w-[var(--w)] sm:self-auto";
const SCATTER =
  "sm:absolute sm:mt-0 sm:left-[var(--x)] sm:top-[var(--y)] sm:[rotate:var(--r)]";

export function PileWindowCard({ win, z }: { win: PileWindow; z: number }) {
  // Stacked, the windows also step left and right; a straight column of cards
  // reads as a list, not as a pile.
  const step = z % 2 === 0 ? "self-end" : "self-start";
  return (
    <div
      className={`${CASCADE} ${step} ${SCATTER} h-[var(--h)] ${FRAME}`}
      style={
        {
          "--x": `${(win.x / STAGE_W) * 100}%`,
          "--y": `${(win.y / STAGE_H) * 100}%`,
          "--w": em(win.w),
          "--h": em(win.h),
          "--r": `${win.r}deg`,
          "--rc": `${win.rc}deg`,
          zIndex: z,
        } as React.CSSProperties
      }
    >
      <div className="flex h-[2.6em] shrink-0 items-center gap-[0.55em] border-b border-[#2e2e2e] bg-[#252526] px-[0.8em]">
        <span className={LIGHTS} />
        <span className={LIGHTS} />
        <span className={LIGHTS} />
        {win.badge ? (
          <span className="shrink-0 rounded-[0.4em] bg-[#c0392b] px-[0.5em] py-[0.15em] font-mono text-[0.85em] font-semibold leading-[1.3] text-white">
            {win.badge}
          </span>
        ) : win.mark ? (
          <span className={`shrink-0 font-mono text-[0.9em] ${win.mark.c}`}>
            {win.mark.t}
          </span>
        ) : null}
        <span className="min-w-0 truncate font-mono text-[0.95em] text-[#919191]">
          {win.label}
        </span>
      </div>
      {/* A too-long line fades off the edge the way it would in a real pane;
          a hard cut is what makes a replica look like clip art. */}
      <div className="overflow-hidden px-[0.75em] py-[0.5em] font-mono [mask-image:linear-gradient(to_right,#000_93%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_93%,transparent)]">
        {win.lines.map((l, i) => (
          <TerminalLine
            key={i}
            line={l}
            size="text-[0.95em] leading-[1.45]"
            fallback="text-[#9a9a9a]"
            gapClass="mt-[1.45em]"
          />
        ))}
      </div>
    </div>
  );
}
