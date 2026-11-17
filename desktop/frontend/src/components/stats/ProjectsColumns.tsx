import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CAPS_LABEL } from "../settings/sectionStyles";
import type { ProjectSortKey } from "./projectsPanelRows";

interface ProjectsColumnsProps {
  sortKey: ProjectSortKey;
  descending: boolean;
  showSpark: boolean;
  showCost: boolean;
  showChange: boolean;
  changeLabel?: string;
  onSort: (key: ProjectSortKey) => void;
}

// The Projects table's column headings, each over its own column; a click on one
// sorts by it, and a second click flips the order.
export function ProjectsColumns({
  sortKey,
  descending,
  showSpark,
  showCost,
  showChange,
  changeLabel,
  onSort,
}: ProjectsColumnsProps) {
  const heading = (key: ProjectSortKey, label: string, title?: string): ReactNode => {
    const active = key === sortKey;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        title={title}
        className={`flex items-center gap-0.5 rounded uppercase tracking-[0.08em] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
          active ? "text-[var(--text-secondary)]" : "hover:text-[var(--text-secondary)]"
        }`}
      >
        {label}
        {active ? (
          descending ? <ChevronDown size={12} className="shrink-0" /> : <ChevronUp size={12} className="shrink-0" />
        ) : null}
      </button>
    );
  };

  return (
    <div className={`flex items-center gap-3 border-b border-[var(--border)] px-4 pb-1.5 pt-1 ${CAPS_LABEL}`}>
      <span className="min-w-0 flex-1">{heading("name", "Project")}</span>
      {showSpark && <span className="w-16 shrink-0">Trend</span>}
      <span className="w-[104px] shrink-0">
        {heading("tokens", "Share", "Share of every project's tokens")}
      </span>
      {showCost && (
        <span className="flex w-14 shrink-0 justify-end">
          {heading("cost", "Cost", "Estimated at API list prices")}
        </span>
      )}
      {showChange && (
        <span className="flex w-14 shrink-0 justify-end">
          {heading("change", "Change", changeLabel ? `Tokens, ${changeLabel}` : undefined)}
        </span>
      )}
    </div>
  );
}
