import type { CSSProperties } from "react";
import type { FleetStateFilter } from "../fleetFilter";
import type { FleetCounts } from "../fleetRows";

const STATUSES = [
  {
    value: "needs-you",
    count: "needsYou",
    label: "needs you",
    dot: "bg-[var(--accent-amber)]",
    active: "bg-[var(--accent-amber)]/15 text-[var(--accent-amber-text)]",
  },
  {
    value: "error",
    count: "error",
    label: "problems",
    dot: "bg-[var(--accent-red)]",
    active: "bg-[var(--accent-red)]/15 text-[var(--accent-red-text)]",
  },
  {
    value: "working",
    count: "working",
    label: "working",
    dot: "bg-[var(--accent-cyan)]",
    active: "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan-text)]",
  },
  {
    value: "done",
    count: "done",
    label: "done",
    dot: "bg-[var(--accent-blue)]",
    active: "bg-[var(--accent-blue)]/15 text-[var(--accent-blue-text)]",
  },
] as const satisfies readonly {
  value: FleetStateFilter;
  count: keyof FleetCounts;
  label: string;
  dot: string;
  active: string;
}[];

export interface FleetStatusFilterProps {
  /** Counted over every row, filter or no filter, so narrowing never hides an
   *  approval prompt from the header. */
  counts: FleetCounts;
  value: FleetStateFilter;
  onChange: (value: FleetStateFilter) => void;
}

export function FleetStatusFilter({
  counts,
  value,
  onChange,
}: FleetStatusFilterProps) {
  // Four zeroes say nothing the empty state doesn't say better.
  const anything = STATUSES.some((status) => counts[status.count] > 0);
  if (!anything && value === "all") return null;

  return (
    <div
      role="group"
      aria-label="Filter by status"
      style={{ "--app-draggable": "no-drag" } as CSSProperties}
      className="flex flex-wrap items-center justify-end gap-0.5 rounded-lg bg-[var(--bg-secondary)]/70 p-0.5"
    >
      {STATUSES.map((status) => {
        const count = counts[status.count];
        const active = value === status.value;
        const empty = count === 0 && !active;
        return (
          <button
            key={status.value}
            type="button"
            disabled={empty}
            aria-pressed={active}
            title={
              empty
                ? `Nothing ${status.label} right now`
                : active
                  ? "Show everything"
                  : `Show only what is ${status.label}`
            }
            onClick={() => onChange(active ? "all" : status.value)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
              active
                ? status.active
                : empty
                  ? "text-[var(--text-muted)] opacity-40"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`}
              aria-hidden
            />
            <span
              className={`font-medium tabular-nums ${
                active || empty ? "" : "text-[var(--text-primary)]"
              }`}
            >
              {count}
            </span>
            <span>{status.label}</span>
          </button>
        );
      })}
    </div>
  );
}
