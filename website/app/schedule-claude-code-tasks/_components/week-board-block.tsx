import type { CSSProperties } from "react";
import type { BoardBlock } from "./week-board-data";

const BG = "#1a1a1a";
const HATCH =
  "repeating-linear-gradient(135deg, rgba(145,145,145,0.16) 0 3px, transparent 3px 6px)";

const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, ${BG})`;

const BADGE: Partial<Record<BoardBlock["state"], string>> = {
  failed: "failed",
  paused: "paused",
};

export function WeekBoardBlock({ block }: { block: BoardBlock }) {
  const { accent, state } = block;
  const filled = state === "ran" || state === "failed";
  const style: CSSProperties = {
    backgroundColor: filled ? mix(accent, 16) : state === "paused" ? "transparent" : mix(accent, 8),
    backgroundImage: state === "paused" ? HATCH : undefined,
    borderWidth: "1px",
    borderStyle: filled ? "solid" : "dashed",
    borderColor: mix(accent, 40),
    borderLeftWidth: "3px",
    borderLeftStyle: state === "expected" || state === "paused" ? "dashed" : "solid",
    borderLeftColor: accent,
  };
  const badge = BADGE[state];

  return (
    <span style={style} className="block min-w-0 rounded-md py-[3px] pl-1 pr-1.5">
      <span
        className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] font-bold tabular-nums"
        style={{ color: accent }}
      >
        {filled && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              state === "failed" ? "bg-[#f87171]" : "bg-[#22d3ee]"
            }`}
          />
        )}
        <span className="truncate">{block.time}</span>
        {badge && (
          <span className="hidden shrink-0 rounded-[3px] bg-[#2f2f2f] px-1 text-[9px] uppercase tracking-[0.08em] text-[#b3b3b3] md:inline">
            {badge}
          </span>
        )}
        {block.unread && (
          <span className="ml-auto hidden shrink-0 rounded-full bg-[#60a5fa] px-1 text-[9px] font-bold text-[#1a1a1a] min-[480px]:inline">
            {block.unread}
          </span>
        )}
      </span>
      <span
        className={`block truncate text-[11px] leading-tight ${
          state === "paused" ? "text-[#b3b3b3]" : "text-[#e5e5e5]"
        }`}
      >
        <span className="mr-1 hidden text-[10px] sm:inline">{block.emoji}</span>
        {block.name}
      </span>
    </span>
  );
}
