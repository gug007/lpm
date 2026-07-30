import type { CSSProperties, RefObject } from "react";
import type { FleetCounts } from "../fleetRows";
import type { FleetKindFilter, FleetStateFilter } from "../fleetFilter";
import { FleetStatusFilter } from "./FleetStatusFilter";
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

export interface FleetHeaderProps {
  counts: FleetCounts;
  kind: FleetKindFilter;
  onKindChange: (kind: FleetKindFilter) => void;
  state: FleetStateFilter;
  onStateChange: (state: FleetStateFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
  /** Any filter narrows the list, so a way back to everything is offered. */
  filtered: boolean;
  onClearFilters: () => void;
}

export function FleetHeader({
  counts,
  kind,
  onKindChange,
  state,
  onStateChange,
  query,
  onQueryChange,
  searchRef,
  grouped,
  onGroupedChange,
  filtered,
  onClearFilters,
}: FleetHeaderProps) {
  return (
    <>
      <div className="app-drag -mx-6 flex items-start gap-4 px-6 py-1">
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
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
            Your agents and automations, with anything waiting on you shown
            first.
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <FleetStatusFilter
            counts={counts}
            value={state}
            onChange={onStateChange}
          />
        </div>
      </div>

      <div className="-mx-6 mt-3 flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-6 pb-3">
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
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <XIcon />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 rounded border border-[var(--border)] px-1 py-0.5 text-[10px] leading-none text-[var(--text-muted)]">
              /
            </kbd>
          )}
        </div>
        <button
          type="button"
          onClick={() => onGroupedChange(!grouped)}
          aria-pressed={grouped}
          title="Group by project (g)"
          className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
            grouped
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <LayersIcon />
          Group by project
        </button>
        {filtered && (
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            <XIcon />
            Clear filters
          </button>
        )}
      </div>
    </>
  );
}
