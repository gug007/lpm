import { useState, useEffect } from "react";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../settings";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { InstallUpdate } from "../../wailsjs/go/main/App";
import type { ProjectInfo } from "../types";
import { SidebarIcon } from "./icons";
import { useDragReorder } from "../hooks/useDragReorder";
import { useSidebarResize } from "../hooks/useSidebarResize";

interface SidebarProps {
  projects: ProjectInfo[];
  selected: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onSettings: () => void;
  onAddProject: () => void;
  onReorder: (order: string[]) => void;
  showSettings: boolean;
}

export function Sidebar({ projects, selected, collapsed, onCollapsedChange, onSelect, onToggle, onSettings, onAddProject, onReorder, showSettings }: SidebarProps) {
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const { width, handleResizeStart } = useSidebarResize();
  const {
    dragIdx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    showDropAbove,
    showDropBelow,
  } = useDragReorder(projects, (p) => p.name, onReorder);

  useEffect(() => EventsOn("update-available", setUpdateInfo), []);

  const handleUpdate = async () => {
    setInstalling(true);
    try {
      await InstallUpdate();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <aside
      className={`relative flex shrink-0 flex-col bg-[var(--bg-sidebar)] transition-[width] duration-200 ${collapsed ? "" : "border-r border-[var(--border)]"}`}
      style={{ width: collapsed ? 0 : width, overflow: collapsed ? "hidden" : undefined }}
    >
      <div className="wails-drag flex h-11 shrink-0 items-center pl-[85px] pt-[7px]">
        <button
          onClick={() => onCollapsedChange(true)}
          style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Collapse sidebar (⌘B)"
        >
          <SidebarIcon />
        </button>
      </div>
      <div className="flex items-center justify-between px-4 pb-2" style={{ minWidth: width }}>
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

      <div className="p-2">
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
      <div
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 -right-1 w-1 cursor-col-resize hover:bg-[var(--accent-cyan)]/20 active:bg-[var(--accent-cyan)]/30"
      />
      {installing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-8 py-6 shadow-2xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-[var(--accent-green)]">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Installing update…</p>
              <p className="text-[11px] text-[var(--text-muted)]">The app will restart automatically</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
