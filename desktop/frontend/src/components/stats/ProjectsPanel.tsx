import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { UsageBreakdown } from "../../types";
import { formatTokenCount, usagePeriodLabel } from "../../agentUsageFormat";
import {
  type ProjectSortKey,
  type SortDirection,
  projectShare,
  sortProjects,
} from "./statsDerive";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const COLLAPSED_COUNT = 8;

const SORT_OPTIONS: { key: ProjectSortKey; label: string; defaultDir: SortDirection }[] = [
  { key: "tokens", label: "Tokens", defaultDir: "desc" },
  { key: "sessions", label: "Sessions", defaultDir: "desc" },
  { key: "name", label: "Name", defaultDir: "asc" },
];

interface ProjectsPanelProps {
  projects: UsageBreakdown[];
  days: number;
}

export function ProjectsPanel({ projects, days }: ProjectsPanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [sortKey, setSortKey] = useState<ProjectSortKey>("tokens");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expanded, setExpanded] = useState(false);

  const onSort = (key: ProjectSortKey, defaultDir: SortDirection) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  };

  const sorted = sortProjects(projects, sortKey, sortDir);
  const maxTokens = Math.max(1, ...projects.map((project) => project.tokens.totalTokens));
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-medium">Projects</h2>
        <div className="flex items-center gap-2 text-[11px]">
          {SORT_OPTIONS.map((option) => {
            const active = option.key === sortKey;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSort(option.key, option.defaultDir)}
                className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {option.label}
                {active &&
                  (sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
              </button>
            );
          })}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="px-4 py-6 text-xs text-[var(--text-muted)]">
          Nothing in {usagePeriodLabel(days)}
        </div>
      ) : (
        <>
          <div className="divide-y divide-[var(--border)]">
            {shown.map((project) => (
              <div
                key={project.key}
                className="flex items-center gap-3 px-4 py-2.5 text-xs transition-colors duration-[120ms] hover:bg-[var(--bg-hover)]"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{project.label}</span>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--bg-active)]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${projectShare(project.tokens.totalTokens, maxTokens) * 100}%`,
                      backgroundColor: "color-mix(in srgb, var(--accent-blue) 32%, transparent)",
                      transition: reducedMotion ? "none" : "width 240ms ease-out",
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 whitespace-nowrap text-right tabular-nums text-[var(--text-muted)]">
                  {project.sessions} session{project.sessions === 1 ? "" : "s"}
                </span>
                <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                  {formatTokenCount(project.tokens.totalTokens)}
                </span>
              </div>
            ))}
          </div>
          {projects.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full border-t border-[var(--border)] px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue)]"
            >
              {expanded ? "Show less" : `Show all (${projects.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
