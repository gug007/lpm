import { useState, useRef } from "react";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../settings";
import type { ProjectInfo } from "../types";

interface SidebarProps {
  projects: ProjectInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onSettings: () => void;
  onAddProject: () => void;
  onReorder: (order: string[]) => void;
  showSettings: boolean;
}

export function Sidebar({ projects, selected, onSelect, onToggle, onSettings, onAddProject, onReorder, showSettings }: SidebarProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef(false);

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, idx: number) => {
    setDragIdx(idx);
    dragRef.current = true;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const newOrder = projects.map((p) => p.name);
      const [moved] = newOrder.splice(dragIdx, 1);
      newOrder.splice(overIdx, 0, moved);
      onReorder(newOrder);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== overIdx) setOverIdx(idx);
  };

  return (
    <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="wails-drag h-8 shrink-0" />
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Projects
        </h2>
        <button
          onClick={onAddProject}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Add project"
        >
          +
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {projects.map((project, idx) => (
          <div key={project.name} className="relative">
            {dragIdx !== null && overIdx === idx && dragIdx !== idx && dragIdx > idx && (
              <div className="absolute left-2 right-2 top-0 h-0.5 rounded bg-[var(--accent-cyan)]" />
            )}
            <button
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnter={(e) => e.preventDefault()}
              onClick={() => onSelect(project.name)}
              onDoubleClick={() => {
                if (getSettings().doubleClickToToggle) {
                  onToggle(project.name);
                }
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selected === project.name
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              } ${dragIdx === idx ? "opacity-40" : ""}`}
            >
              <StatusDot running={project.running} />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {project.services?.length || 0}
              </span>
            </button>
            {dragIdx !== null && overIdx === idx && dragIdx !== idx && dragIdx < idx && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded bg-[var(--accent-cyan)]" />
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-2">
        <button
          onClick={onSettings}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            showSettings
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>
      </div>
    </aside>
  );
}
