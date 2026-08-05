"use client";

import { ChevronRight, Folder, PanelLeftClose } from "lucide-react";
import {
  FOLDER_MEMBERS,
  FOLDER_NAME,
  TOP_LEVEL,
  projectByKey,
  type ProjectKey,
} from "./walkthrough-data";

type Props = {
  selected: ProjectKey;
  onSelect: (key: ProjectKey) => void;
  folderOpen: boolean;
  onToggleFolder: () => void;
  onHide: () => void;
};

export function SidebarPanel({
  selected,
  onSelect,
  folderOpen,
  onToggleFolder,
  onHide,
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
        <span className="text-[10px] font-medium tracking-wider text-[#919191] uppercase">
          Projects
        </span>
        <button
          type="button"
          onClick={onHide}
          data-focus="collapse-sidebar"
          title="Collapse sidebar (⌘B in the app)"
          className="hidden h-6 w-6 items-center justify-center rounded text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none md:flex"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Hide the project sidebar</span>
        </button>
      </div>

      <nav
        aria-label="Projects"
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
      >
        <button
          type="button"
          onClick={onToggleFolder}
          aria-expanded={folderOpen}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-[#8f8f8f] transition-transform ${
              folderOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          />
          <Folder className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f]" aria-hidden />
          <span className="min-w-0 truncate">{FOLDER_NAME}</span>
        </button>

        {folderOpen && (
          <ul className="mt-0.5">
            {FOLDER_MEMBERS.map((key) => (
              <li key={key} className="pl-3">
                <ProjectRow
                  projectKey={key}
                  selected={selected === key}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-0.5">
          {TOP_LEVEL.map((key) => (
            <li key={key}>
              <ProjectRow
                projectKey={key}
                selected={selected === key}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function ProjectRow({
  projectKey,
  selected,
  onSelect,
}: {
  projectKey: ProjectKey;
  selected: boolean;
  onSelect: (key: ProjectKey) => void;
}) {
  const project = projectByKey(projectKey);
  const needsYou = project.agent === "needs-you";

  return (
    <button
      type="button"
      onClick={() => onSelect(projectKey)}
      data-focus={selected ? "selected-project" : undefined}
      aria-current={selected ? "true" : undefined}
      aria-label={`${project.name}, ${
        project.run === "running" ? "running" : "stopped"
      }${needsYou ? ", agent needs you" : ""}`}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
        selected
          ? "bg-[#333333] text-[#e5e5e5]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          project.run === "running"
            ? "bg-[#4ade80]"
            : "border border-[#8f8f8f] bg-transparent"
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate ${needsYou ? "text-[#f59e0b]" : ""}`}
      >
        {project.name}
      </span>
      {needsYou && (
        <span
          aria-hidden
          className="shrink-0 text-[9px] tracking-wide text-[#f59e0b] uppercase"
        >
          needs you
        </span>
      )}
    </button>
  );
}
