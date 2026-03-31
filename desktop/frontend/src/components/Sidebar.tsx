import { useState, useRef, useEffect } from "react";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../settings";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { InstallUpdate } from "../../wailsjs/go/main/App";
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
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => EventsOn("update-available", setUpdateInfo), []);

  const handleUpdate = async () => {
    setInstalling(true);
    try {
      await InstallUpdate();
    } catch {
      setInstalling(false);
    }
  };

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

  const isDragging = dragIdx !== null;
  const showDropAbove = (idx: number) => isDragging && overIdx === idx && dragIdx !== idx && dragIdx! > idx;
  const showDropBelow = (idx: number) => isDragging && overIdx === idx && dragIdx !== idx && dragIdx! < idx;

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
            {showDropAbove(idx) && (
              <div className="absolute inset-x-3 top-0 h-px bg-[var(--accent-cyan)]" />
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
              } ${dragIdx === idx ? "opacity-30" : ""}`}
            >
              <StatusDot running={project.running} />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {project.services?.length || 0}
              </span>
            </button>
            {showDropBelow(idx) && (
              <div className="absolute inset-x-3 bottom-0 h-px bg-[var(--accent-cyan)]" />
            )}
          </div>
        ))}
      </nav>

      {updateInfo && (
        <button
          onClick={handleUpdate}
          disabled={installing}
          className="mx-2 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]" />
          <span className="text-xs text-[var(--text-secondary)]">
            {installing ? "Updating..." : `v${updateInfo.latestVersion}`}
          </span>
          {!installing && (
            <span className="ml-auto text-[10px] font-medium text-[var(--accent-green)]">
              Update
            </span>
          )}
        </button>
      )}

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
