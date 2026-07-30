import type { ReactNode } from "react";
import {
  ChevronRightIcon,
  FolderIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "./icons";

export interface FleetEmptyProps {
  /** A filter is narrowing the list, so nothing shown is not nothing running. */
  filtered: boolean;
  /** Projects with no agent, service, or automation running in them. */
  quietProjectCount: number;
  /** Where "Open" goes: the last project the user was in, else the first one.
   *  Null only when there are no projects at all. */
  openProject: { name: string; label: string } | null;
  /** Paired Macs whose automations this list cannot reach — say so rather than
   *  imply the list is complete. */
  hiddenAutomationMacs: string[];
  onClearFilters: () => void;
  onOpenProject: (project: string) => void;
  onAddProject: () => void;
  onOpenAutomations: () => void;
}

const PRIMARY =
  "flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

const SECONDARY =
  "flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

export function FleetEmpty({
  filtered,
  quietProjectCount,
  openProject,
  hiddenAutomationMacs,
  onClearFilters,
  onOpenProject,
  onAddProject,
  onOpenAutomations,
}: FleetEmptyProps) {
  let icon: ReactNode;
  let title: string;
  let body: string;
  let actions: ReactNode;
  const notes: string[] = [];

  if (filtered) {
    icon = <SearchIcon />;
    title = "Nothing matches";
    body = "No agent, service, or automation fits the filters you have on.";
    actions = (
      <button type="button" onClick={onClearFilters} className={PRIMARY}>
        <XIcon />
        Clear filters
      </button>
    );
  } else if (openProject === null) {
    icon = <FolderIcon />;
    title = "No projects yet";
    body =
      "Add a project, then everything running in it — agents, services, and automations — shows up here.";
    actions = (
      <button type="button" onClick={onAddProject} className={PRIMARY}>
        <PlusIcon />
        Add project
      </button>
    );
  } else {
    icon = <LayersIcon />;
    title = "Nothing is running";
    body = `${
      quietProjectCount > 1 ? `All ${quietProjectCount} projects are quiet. ` : ""
    }Start Claude Code or Codex in a project and it shows up here, with anything waiting on you first.`;
    actions = (
      <>
        <button
          type="button"
          onClick={() => onOpenProject(openProject.name)}
          className={PRIMARY}
        >
          Open {openProject.label}
          <ChevronRightIcon />
        </button>
        <button type="button" onClick={onOpenAutomations} className={SECONDARY}>
          Automations
        </button>
      </>
    );
    notes.push("Terminal sessions aren't tracked.");
  }

  if (hiddenAutomationMacs.length > 0) {
    notes.push(
      `Automations on ${hiddenAutomationMacs.join(", ")} aren't listed here.`,
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] [&_svg]:h-[19px] [&_svg]:w-[19px]">
          {icon}
        </span>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
        {notes.map((note, index) => (
          <p
            key={note}
            className={`text-[11px] text-[var(--text-muted)] ${index === 0 ? "mt-5" : "mt-1"}`}
          >
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}
