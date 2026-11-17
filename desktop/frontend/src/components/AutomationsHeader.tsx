import { Clock } from "lucide-react";
import type { ContentZoom } from "../hooks/useContentZoom";
import { GLOBAL_COLUMN, GlobalPageHeader } from "./GlobalPageHeader";
import { PlusIcon } from "./icons";
import type { JobListFilter } from "./project-detail/jobs/useJobListFilter";
import { BTN_PRIMARY, BTN_SECONDARY } from "./ui/buttons";
import { PageHeader } from "./ui/PageHeader";
import { SegmentedControl } from "./ui/SegmentedControl";
import { ZoomControl } from "./ui/ZoomControl";

export type AutomationsViewMode = "list" | "week";

const VIEW_OPTIONS = [
  { value: "list" as const, label: "List", tooltip: "Every automation as a feed, newest activity first" },
  { value: "week" as const, label: "Week", tooltip: "When each automation fires, across the week" },
];

interface AutomationsHeaderProps {
  // Showing one project's jobs rather than every project's.
  scoped: boolean;
  hasJobs: boolean;
  unreadCount: number;
  view: AutomationsViewMode;
  onViewChange: (view: AutomationsViewMode) => void;
  // How many rows each filter keeps, and the one the list shows.
  filterCounts: Record<JobListFilter, number>;
  filter: JobListFilter;
  onFilterChange: (filter: JobListFilter) => void;
  zoom: ContentZoom;
  onMarkAllSeen: () => void;
  onNewJob: () => void;
}

function summary(scoped: boolean, unreadCount: number, view: AutomationsViewMode, filter: JobListFilter): string {
  if (view === "list" && filter === "needs") return "The automations waiting for your answer.";
  if (view === "list" && filter === "failed") return "The automations whose last run failed.";
  if (unreadCount > 0) {
    return `${unreadCount} ${unreadCount === 1 ? "automation has" : "automations have"} new messages since you last looked.`;
  }
  if (view === "week") {
    return scoped
      ? "When this project's automations fire, across the week."
      : "When every automation fires, across the week.";
  }
  return scoped
    ? "The automations that run in this project."
    : "Every automation across your projects, in one place.";
}

const FILTERS: { value: JobListFilter; label: string; countTone?: string; tooltip?: string }[] = [
  { value: "all", label: "All" },
  {
    value: "needs",
    label: "Needs you",
    countTone: "text-[var(--accent-amber)]",
    tooltip: "Only the automations waiting for your answer",
  },
  {
    value: "failed",
    label: "Failed",
    countTone: "text-[var(--accent-red-text)]",
    tooltip: "Only the automations whose last run failed",
  },
];

const count = (n: number, tone = "text-[var(--text-muted)]") => (
  <span className={`ml-1.5 tabular-nums ${tone}`}>{n}</span>
);

export function AutomationsHeader({
  scoped,
  hasJobs,
  unreadCount,
  view,
  onViewChange,
  filterCounts,
  filter,
  onFilterChange,
  zoom,
  onMarkAllSeen,
  onNewJob,
}: AutomationsHeaderProps) {
  // The reader zoom stays on ⌘+ / ⌘− in the list; its stepper shows there only
  // once the list is zoomed, so it can be put back.
  const showZoom = hasJobs && (view === "week" || zoom.percent !== 100);
  const filters = FILTERS.filter((f) => f.value === "all" || filterCounts[f.value] > 0).map((f) => ({
    value: f.value,
    label: (
      <>
        {f.label}
        {count(filterCounts[f.value], f.countTone)}
      </>
    ),
    tooltip: f.tooltip,
  }));
  const header = {
    title: "Automations",
    icon: scoped ? Clock : undefined,
    description: summary(scoped, unreadCount, view, filter),
    actions: (
      <>
        {unreadCount > 0 && (
          <button type="button" onClick={onMarkAllSeen} className={`${BTN_SECONDARY} whitespace-nowrap`}>
            Mark all read
          </button>
        )}
        <button
          type="button"
          onClick={onNewJob}
          className={`${BTN_PRIMARY} flex items-center gap-1.5 whitespace-nowrap`}
        >
          <PlusIcon />
          New automation
        </button>
      </>
    ),
  };

  return (
    <div className="shrink-0">
      {scoped ? (
        <PageHeader {...header} className="pt-5" />
      ) : (
        <GlobalPageHeader {...header} column />
      )}
      {hasJobs && (
        <div className={`mt-4 flex items-center gap-2 ${scoped ? "" : GLOBAL_COLUMN}`}>
          {view === "list" && filters.length > 1 && (
            <>
              <span className="text-[12px] text-[var(--text-muted)]">Show</span>
              <SegmentedControl value={filter} options={filters} onChange={onFilterChange} ariaLabel="Show" />
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {showZoom && (
              <ZoomControl
                percent={zoom.percent}
                onZoomIn={zoom.zoomIn}
                onZoomOut={zoom.zoomOut}
                onReset={zoom.zoomReset}
                canZoomIn={zoom.canZoomIn}
                canZoomOut={zoom.canZoomOut}
              />
            )}
            <SegmentedControl value={view} options={VIEW_OPTIONS} onChange={onViewChange} ariaLabel="Automations view" />
          </div>
        </div>
      )}
    </div>
  );
}
