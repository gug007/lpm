import { ChevronDown, ChevronUp } from "lucide-react";
import {
  defaultDirection,
  sortProjects,
  type ProjectRow,
  type ProjectSort,
  type ProjectSortKey,
} from "./stats-derive";
import { formatTokenCount, plural } from "./stats-format";

const COLLAPSED_COUNT = 8;

const SORT_OPTIONS: { key: ProjectSortKey; label: string }[] = [
  { key: "tokens", label: "Tokens" },
  { key: "sessions", label: "Sessions" },
  { key: "name", label: "Name" },
];

export default function StatsProjects({
  projects,
  sort,
  onSort,
  showAll,
  onShowAll,
}: {
  projects: ProjectRow[];
  sort: ProjectSort;
  onSort: (key: ProjectSortKey) => void;
  showAll: boolean;
  onShowAll: (next: boolean) => void;
}) {
  const sorted = sortProjects(projects, sort);
  const maxTokens = Math.max(1, ...projects.map((project) => project.tokens));

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Projects</p>
        <div role="group" aria-label="Sort projects" className="flex items-center gap-1 text-[11px]">
          {SORT_OPTIONS.map((option) => {
            const active = option.key === sort.key;
            const dir = active ? sort.dir : defaultDirection(option.key);
            const Icon = dir === "desc" ? ChevronDown : ChevronUp;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                aria-label={`Sort by ${option.label.toLowerCase()}, ${dir === "desc" ? "descending" : "ascending"}`}
                onClick={() => onSort(option.key)}
                className={`flex min-h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors duration-[120ms] ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {option.label}
                {active && <Icon aria-hidden size={12} />}
              </button>
            );
          })}
        </div>
      </div>

      <ol className="[&>li+li]:border-t [&>li+li]:border-[var(--border)]">
        {sorted.map((project, index) => (
          <li
            key={project.name}
            className={`items-center gap-2 px-3 py-2.5 text-xs transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] sm:gap-3 sm:px-4 ${
              showAll || index < COLLAPSED_COUNT ? "flex" : "hidden"
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
              {project.name}
            </span>
            <span
              aria-hidden
              className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--bg-active)] sm:w-20"
            >
              <span
                className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-[240ms] motion-safe:ease-out"
                style={{
                  width: `${(project.tokens / maxTokens) * 100}%`,
                  backgroundColor: "color-mix(in srgb, var(--accent-blue) 32%, transparent)",
                }}
              />
            </span>
            <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right tabular-nums text-[var(--text-muted)] sm:w-20">
              {plural(project.sessions, "session")}
            </span>
            <span className="w-11 shrink-0 text-right font-medium tabular-nums text-[var(--text-primary)] sm:w-14">
              {formatTokenCount(project.tokens)}
            </span>
          </li>
        ))}
      </ol>

      {projects.length > COLLAPSED_COUNT && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => onShowAll(!showAll)}
          className="mt-auto min-h-11 w-full border-t border-[var(--border)] px-4 text-[11px] font-medium text-[var(--text-muted)] transition-colors duration-[120ms] -outline-offset-2 md:min-h-9 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {showAll ? "Show less" : `Show all (${projects.length})`}
        </button>
      )}
    </div>
  );
}
