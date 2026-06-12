"use client";

import type { DemoProject } from "./projects";

type SidebarProps = {
  projects: DemoProject[];
  selected: string;
  onSelect: (name: string) => void;
  runningByProject: Record<string, Set<string>>;
  onAddProject: () => void;
};

export function DemoSidebar({
  projects,
  selected,
  onSelect,
  runningByProject,
  onAddProject,
}: SidebarProps) {
  return (
    <aside
      aria-label="Projects"
      className="hidden sm:flex shrink-0 w-44 lg:w-52 flex-col bg-[#1e1e1e] border-r border-[#2e2e2e]"
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-3 pt-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
          Projects
        </div>
        <button
          type="button"
          onClick={onAddProject}
          title="Add project"
          aria-label="Add project"
          className="flex h-5 w-5 items-center justify-center rounded text-[#919191] text-sm transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          +
        </button>
      </div>
      <nav aria-label="Project list" className="flex-1 overflow-y-auto px-2">
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
              className={`flex w-full select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                isSelected
                  ? "bg-[#333333] text-[#e5e5e5]"
                  : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
                  isRunning
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
                    : "border border-[#454545]"
                }`}
              />
              <span className="truncate">{project.label ?? project.name}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex flex-col gap-0.5 p-2 border-t border-[#2e2e2e]">
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[#919191]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Demo mode</span>
        </div>
      </div>
    </aside>
  );
}
