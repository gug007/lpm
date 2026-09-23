import { Fragment, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { DAYS, LEGEND_PROJECTS, ROWS, TODAY } from "./week-board-data";
import { WeekBoardBlock } from "./week-board-block";
import { ReplicaWindow } from "./replica-window";

const QUIET_HATCH =
  "repeating-linear-gradient(135deg, rgba(145,145,145,0.09) 0 3px, transparent 3px 7px)";
const HOUR = "border-t border-[#2e2e2e] pr-1.5 pt-1 text-right text-[10px] leading-tight tabular-nums text-[#919191]";

const KEY_HATCH =
  "repeating-linear-gradient(135deg, rgba(145,145,145,0.16) 0 3px, transparent 3px 6px)";

const keyStyle = (
  fill: string,
  border: "solid" | "dashed" | "dotted",
  edge: "solid" | "dashed",
  { accent = "#919191", hatch = false, faded = false } = {},
): CSSProperties => ({
  backgroundColor: fill,
  backgroundImage: hatch ? KEY_HATCH : undefined,
  borderWidth: "1px",
  borderStyle: border,
  borderColor: `color-mix(in srgb, ${accent} 40%, #1a1a1a)`,
  borderLeftWidth: "3px",
  borderLeftStyle: edge,
  borderLeftColor: accent,
  opacity: faded ? 0.75 : undefined,
});

const STATE_KEYS = [
  { label: "ran", style: keyStyle("#2b2b2b", "solid", "solid") },
  { label: "running", style: keyStyle("#1c3438", "solid", "solid", { accent: "#22d3ee" }) },
  { label: "upcoming", style: keyStyle("#222222", "dashed", "solid") },
  { label: "~ expected", style: keyStyle("#222222", "dashed", "dashed") },
  { label: "missed", style: keyStyle("transparent", "dotted", "solid", { faded: true }) },
  { label: "paused", style: keyStyle("transparent", "dashed", "dashed", { hatch: true }) },
];

function dayVisibility(day: number): string {
  if (Math.abs(day - TODAY) <= 1) return "flex";
  return day < TODAY ? "hidden sm:flex" : "hidden md:flex";
}

function cellTint(day: number): string {
  if (day === TODAY) return "bg-[#60a5fa]/[0.05]";
  if (day >= 5) return "bg-white/[0.02]";
  return "";
}

export function WeekBoardReplica() {
  return (
    <ReplicaWindow
      title={
        <>
          <span className="hidden sm:inline">lpm — </span>Automations · Week
        </>
      }
    >
      <div className="space-y-3 p-3 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md text-[#919191]">
            <ChevronLeft className="h-4 w-4" />
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-md text-[#919191]">
            <ChevronRight className="h-4 w-4" />
          </span>
          <span className="ml-1 whitespace-nowrap text-[13px] font-semibold text-[#e5e5e5]">This week</span>
          <span className="flex-1" />
          <span className="flex rounded-lg bg-[#242424] p-0.5 text-[12px] font-medium">
            <span className="px-2.5 py-1 text-[#919191]">List</span>
            <span className="rounded-md bg-[#3a3a3a] px-2.5 py-1 text-[#e5e5e5]">Week</span>
          </span>
        </div>

        <div className="grid grid-cols-[40px_repeat(3,minmax(0,1fr))] overflow-hidden rounded-lg border border-[#2e2e2e] sm:grid-cols-[44px_repeat(4,minmax(0,1fr))] md:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-[#2e2e2e] bg-[#242424] px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[#919191]">
            Time
          </div>
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={`${dayVisibility(i)} min-w-0 items-center gap-1.5 border-b border-l border-[#2e2e2e] px-2 py-1.5 text-[11px] ${
                i === TODAY ? "bg-[#2a3444]" : "bg-[#242424]"
              } ${i < TODAY ? "opacity-70" : ""}`}
            >
              <span className={`font-semibold ${i === TODAY ? "text-[#60a5fa]" : "text-[#e5e5e5]"}`}>
                {day}
              </span>
              {i === TODAY && (
                <span className="ml-auto hidden shrink-0 rounded-[3px] bg-[#60a5fa] px-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a] min-[480px]:inline">
                  Today
                </span>
              )}
            </div>
          ))}

          {ROWS.map((row) =>
            row.kind === "quiet" ? (
              <Fragment key={row.from}>
                <div className={HOUR}>
                  {row.from}
                  <span className="block opacity-80">{row.to}</span>
                </div>
                <div
                  className="col-span-3 flex min-h-[20px] items-center justify-center border-l border-t border-[#2e2e2e] text-[10px] text-[#919191] sm:col-span-4 md:col-span-7"
                  style={{ backgroundImage: QUIET_HATCH }}
                >
                  nothing scheduled {row.from} – {row.to}
                </div>
              </Fragment>
            ) : (
              <Fragment key={row.from}>
                <div className={HOUR}>
                  {row.from}
                  <span className="block opacity-80">{row.to}</span>
                </div>
                {row.cells.map((block, i) => (
                  <div
                    key={i}
                    className={`${dayVisibility(i)} min-h-[34px] min-w-0 flex-col gap-[3px] border-l border-t border-[#2e2e2e] p-1 ${cellTint(i)} ${
                      i < TODAY ? "opacity-80" : ""
                    }`}
                  >
                    {block && <WeekBoardBlock block={block} />}
                  </div>
                ))}
              </Fragment>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[10px] text-[#919191]">
          {LEGEND_PROJECTS.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: p.color }} />
              {p.label}
            </span>
          ))}
          <span className="h-3 w-px bg-[#2e2e2e]" />
          {STATE_KEYS.map((key) => (
            <span key={key.label} className="inline-flex items-center gap-1.5">
              <span className="h-[13px] w-[22px] rounded-[3px]" style={key.style} />
              {key.label}
            </span>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#2e2e2e]">
          <div className="flex items-baseline gap-2 border-b border-[#2e2e2e] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b3b3b3]">
            Not on the board
            <span className="text-[11px] font-normal normal-case tracking-normal text-[#919191]">1 job</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 text-[12px]">📝</span>
                <span className="min-w-0 truncate text-[13px] font-medium text-[#e5e5e5]">Release notes draft</span>
                <span className="shrink-0 text-[11px] text-[#919191]">saas-app</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-[#919191]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee]" />
                Done, 5d ago
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-md border border-[#2e2e2e] px-2 py-1 text-[11px] font-medium text-[#b3b3b3]">
              <Play className="h-3 w-3" fill="currentColor" />
              Run now
            </span>
          </div>
        </div>
      </div>
    </ReplicaWindow>
  );
}
