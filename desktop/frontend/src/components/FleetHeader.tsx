import type { CSSProperties, RefObject } from "react";
import type { FleetCounts } from "../fleetRows";
import type { FleetKindFilter } from "../fleetFilter";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Tooltip } from "./ui/Tooltip";
import { HelpCircleIcon, LayersIcon, SearchIcon, XIcon } from "./icons";

const ACTIVITY_SCOPE =
  "Activity includes supported agents started from projects opened during this session. Terminal sessions aren't tracked.";

export const KIND_OPTIONS: readonly {
  value: FleetKindFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "agents", label: "Agents" },
  { value: "services", label: "Services" },
  { value: "automations", label: "Automations" },
];

const COUNTS = [
  { key: "needsYou", label: "needs you", dot: "bg-[var(--accent-amber)]" },
  { key: "error", label: "problems", dot: "bg-[var(--accent-red)]" },
  { key: "working", label: "working", dot: "bg-[var(--accent-cyan)]" },
  { key: "done", label: "done", dot: "bg-[var(--accent-blue)]" },
] as const;

export interface FleetHeaderProps {
  counts: FleetCounts;
  kind: FleetKindFilter;
  onKindChange: (kind: FleetKindFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
}

export function FleetHeader({
  counts,
  kind,
  onKindChange,
  query,
  onQueryChange,
  searchRef,
  grouped,
  onGroupedChange,
}: FleetHeaderProps) {
  return (
    <>
      <div className="app-drag -mx-6 flex items-center gap-4 px-6 py-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
            <Tooltip
              content={ACTIVITY_SCOPE}
              side="bottom"
              align="start"
              wide
              delay={300}
            >
              <button
                type="button"
                aria-label={ACTIVITY_SCOPE}
                style={{ "--app-draggable": "no-drag" } as CSSProperties}
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
              >
                <HelpCircleIcon />
              </button>
            </Tooltip>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Your agents and automations, with anything waiting on you shown
            first.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {COUNTS.map((count) => {
            const value = counts[count.key];
            return (
              <span
                key={count.key}
                className={`flex items-center gap-1.5 text-[11px] ${
                  value === 0 ? "opacity-40" : ""
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${count.dot}`}
                  aria-hidden
                />
                <span className="font-medium tabular-nums text-[var(--text-primary)]">
                  {value}
                </span>
                <span className="text-[var(--text-muted)]">{count.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <SegmentedControl
          value={kind}
          options={KIND_OPTIONS}
          onChange={onKindChange}
          variant="subtle"
          ariaLabel="Filter activity"
        />
        <div className="relative flex min-w-0 max-w-xs flex-1 items-center">
          <span className="pointer-events-none absolute left-2.5 text-[var(--text-muted)]">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            spellCheck={false}
            data-text-scope=""
            placeholder="Search projects and agents"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              if (query) onQueryChange("");
              else searchRef.current?.blur();
            }}
            className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)]/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <XIcon />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onGroupedChange(!grouped)}
          aria-pressed={grouped}
          title="Group by project (g)"
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
            grouped
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <LayersIcon />
          Group by project
        </button>
      </div>
    </>
  );
}
