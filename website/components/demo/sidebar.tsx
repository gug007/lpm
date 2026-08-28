"use client";

import { useState } from "react";
import { Plus, Terminal } from "lucide-react";
import type { AgentTabState } from "./project-view";
import type { AiStatus, DemoProject } from "./projects";
import { SidebarMoreMenu } from "./sidebar-more-menu";
import { SidebarProjectRow } from "./sidebar-project-row";
import { SidebarUsage } from "./sidebar-usage";
import { FOCUS_RING, PRESS } from "./ui";
import type { UsageSidebarSettings } from "./usage-data";
import type { DemoView } from "./views";

type SidebarProps = {
  projects: DemoProject[];
  selected: string;
  activeView: DemoView;
  onSelect: (name: string) => void;
  runningByProject: Record<string, Set<string>>;
  aiStatusByProject: Record<string, AiStatus>;
  agentTabStatusByProject?: Record<string, Record<string, AgentTabState>>;
  onAddProject: () => void;
  onOpenView: (view: DemoView) => void;
  usageSettings: UsageSidebarSettings;
  hasError: boolean;
  unreadAutomations: number;
  runningAutomations: number;
};

export function DemoSidebar({
  projects,
  selected,
  activeView,
  onSelect,
  runningByProject,
  aiStatusByProject,
  agentTabStatusByProject,
  onAddProject,
  onOpenView,
  usageSettings,
  hasError,
  unreadAutomations,
  runningAutomations,
}: SidebarProps) {
  const projectSelected = activeView === "project";
  // A project shows its agents until the user folds them away, so the list
  // tracks what is closed rather than what is open.
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set());

  const toggleAgents = (name: string) =>
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <aside
      aria-label="Projects"
      className="hidden sm:flex shrink-0 w-52 lg:w-[260px] flex-col bg-[#1e1e1e] border-r border-[#2e2e2e]"
    >
      <div className="relative flex h-11 shrink-0 items-center justify-end pr-3 pt-[7px]">
        <span
          aria-hidden="true"
          className="absolute left-[14px] top-[19px] flex items-center gap-2"
        >
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        {/* Window chrome, not a control: the demo has no collapsed state to go to. */}
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded text-[#919191]"
        >
          <svg
            viewBox="0 0 22 16"
            width={18}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="1" width="20" height="14" rx="2.5" />
            <line x1="8" y1="1" x2="8" y2="15" />
          </svg>
        </span>
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="text-xs font-medium uppercase tracking-wider text-[#919191]">
          Projects
        </div>
        <button
          type="button"
          onClick={onAddProject}
          title="Add project"
          aria-label="Add project"
          className={`flex h-5 w-5 items-center justify-center rounded text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <nav aria-label="Project list" className="flex-1 overflow-y-auto px-2">
        {projects.map((project) => (
          <SidebarProjectRow
            key={project.name}
            project={project}
            selected={projectSelected && selected === project.name}
            running={(runningByProject[project.name]?.size ?? 0) > 0}
            aiStatus={aiStatusByProject[project.name]}
            agentTabs={agentTabStatusByProject?.[project.name]}
            expanded={!collapsedAgents.has(project.name)}
            onToggleAgents={() => toggleAgents(project.name)}
            onSelect={() => onSelect(project.name)}
          />
        ))}
      </nav>
      <SidebarUsage settings={usageSettings} onOpen={() => onOpenView("usage")} />
      <div className="flex flex-col gap-0.5 p-2">
        <FooterRow
          icon={<Terminal className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Terminals"
          active={activeView === "terminals"}
          onClick={() => onOpenView("terminals")}
        />
        <SidebarMoreMenu
          activeView={activeView}
          onOpen={onOpenView}
          hasError={hasError}
          unreadAutomations={unreadAutomations}
          runningAutomations={runningAutomations}
        />
      </div>
    </aside>
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
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${FOCUS_RING} ${
        active
          ? "bg-[#333333] text-[#e5e5e5]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
