"use client";

import type { DemoProject } from "./projects";

type MobileProjectSwitcherProps = {
  projects: DemoProject[];
  selected: string;
  onSelect: (name: string) => void;
  runningByProject: Record<string, Set<string>>;
  onAddProject: () => void;
};

export function MobileProjectSwitcher({
  projects,
  selected,
  onSelect,
  runningByProject,
  onAddProject,
}: MobileProjectSwitcherProps) {
  return (
    <nav
      aria-label="Projects"
      className="flex sm:hidden shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#2e2e2e] bg-[#1e1e1e] px-2 py-1.5"
    >
      {projects.map((project) => {
        const running = runningByProject[project.name];
        const isRunning = running && running.size > 0;
        const isSelected = selected === project.name;
        return (
          <button
            key={project.name}
            type="button"
            onClick={() => onSelect(project.name)}
            aria-current={isSelected ? "true" : undefined}
            aria-label={`${project.label ?? project.name}${isRunning ? ", running" : ""}`}
            className={`flex shrink-0 select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              isSelected
                ? "bg-[#333333] text-[#e5e5e5]"
                : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block w-[6px] h-[6px] rounded-full shrink-0 ${
                isRunning
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
                  : "border border-[#454545]"
              }`}
            />
            <span className="whitespace-nowrap">
              {project.label ?? project.name}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAddProject}
        title="Add project"
        aria-label="Add project"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#919191] text-sm transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        +
      </button>
    </nav>
  );
}
