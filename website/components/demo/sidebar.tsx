"use client";

import { AlertCircle, Check, Settings, Terminal } from "lucide-react";
import type { AiStatus, DemoProject } from "./projects";

type SidebarView = "project" | "terminals" | "settings";

type SidebarProps = {
  projects: DemoProject[];
  selected: string;
  activeView: SidebarView;
  onSelect: (name: string) => void;
  runningByProject: Record<string, Set<string>>;
  aiStatusByProject: Record<string, AiStatus>;
  onAddProject: () => void;
  onOpenTerminals: () => void;
  onOpenSettings: () => void;
};

export function DemoSidebar({
  projects,
  selected,
  activeView,
  onSelect,
  runningByProject,
  aiStatusByProject,
  onAddProject,
  onOpenTerminals,
  onOpenSettings,
}: SidebarProps) {
  const projectSelected = activeView === "project";

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
        {projects.map((project) => (
          <ProjectRow
            key={project.name}
            project={project}
            selected={projectSelected && selected === project.name}
            running={(runningByProject[project.name]?.size ?? 0) > 0}
            aiStatus={aiStatusByProject[project.name]}
            onSelect={() => onSelect(project.name)}
          />
        ))}
      </nav>
      <div className="flex flex-col gap-0.5 p-2">
        <FooterRow
          icon={<Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Terminals"
          active={activeView === "terminals"}
          onClick={onOpenTerminals}
        />
        <FooterRow
          icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Settings"
          active={activeView === "settings"}
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
}

function ProjectRow({
  project,
  selected,
  running,
  aiStatus,
  onSelect,
}: {
  project: DemoProject;
  selected: boolean;
  running: boolean;
  aiStatus?: AiStatus;
  onSelect: () => void;
}) {
  const label = project.label ?? project.name;
  const nameClass =
    aiStatus === "running"
      ? "sidebar-shimmer"
      : aiStatus === "waiting"
        ? "sidebar-waiting"
        : aiStatus === "error"
          ? "text-red-400"
          : aiStatus === "done"
            ? "text-[#60a5fa]"
            : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`${label}${running ? ", running" : ""}${aiStatus ? `, agent ${aiStatus}` : ""}`}
      className={`flex w-full select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
        selected
          ? "bg-[#333333] text-[#e5e5e5]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
          running
            ? "bg-[#4ade80]"
            : "border border-[#454545]"
        }`}
      />
      <span className={`min-w-0 flex-1 truncate ${nameClass}`}>{label}</span>
      {aiStatus === "error" ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={2} />
      ) : aiStatus === "done" ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-[#60a5fa]" strokeWidth={2.25} />
      ) : null}
    </button>
  );
}

function FooterRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
        active
          ? "bg-[#333333] text-[#e5e5e5]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span className="shrink-0 text-[#919191]">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
