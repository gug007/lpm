import { useEffect, useMemo, useState } from "react";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../settings";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { InstallUpdate } from "../../wailsjs/go/main/App";
import { type ProjectInfo, STATUS_RUNNING, STATUS_DONE, STATUS_WAITING, STATUS_ERROR } from "../types";
import { SidebarIcon, CheckIcon, AlertCircleIcon, BellIcon, HelpCircleIcon } from "./icons";
import { ProgressBar } from "./ui/ProgressBar";
import { SortableItem, SortableList } from "./ui/SortableList";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { SpinnerIcon } from "./project-detail/icons";

const MUTED_STYLE = { color: "var(--text-muted)" } as const;
const DONE_STYLE = { color: "var(--accent-blue)" } as const;

interface SidebarProps {
  projects: ProjectInfo[];
  selected: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onSettings: () => void;
  onFeedback: () => void;
  onAddProject: () => void;
  onDuplicateProject: (name: string) => void;
  onRemoveProject: (name: string) => void;
  onReorder: (order: string[]) => void;
  showSettings: boolean;
  duplicatingName: string | null;
}

function hasStatus(project: ProjectInfo, value: string): boolean {
  return project.statusEntries?.some(e => e.value === value) ?? false;
}

export function Sidebar({ projects, selected, collapsed, onCollapsedChange, onSelect, onToggle, onSettings, onFeedback, onAddProject, onDuplicateProject, onRemoveProject, onReorder, showSettings, duplicatingName }: SidebarProps) {
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1); // -1 = no progress yet
  const [updatePhase, setUpdatePhase] = useState<"downloading" | "installing">("downloading");
  const [updateError, setUpdateError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [confirmRemoveDuplicate, setConfirmRemoveDuplicate] = useState<string | null>(null);
  const { width, handleResizeStart } = useSidebarResize();

  const contextProject = contextMenu
    ? projects.find((p) => p.name === contextMenu.name)
    : null;
  // Memoized so the SortableContext items reference is stable across the
  // frequent status-update re-renders Sidebar gets — otherwise every status
  // tick would churn the sortable subscriptions.
  const projectIds = useMemo(() => projects.map((p) => p.name), [projects]);

  useEffect(() => EventsOn("update-available", setUpdateInfo), []);
  useEffect(() => EventsOn("update-progress", (pct: number) => setProgress(pct)), []);
  useEffect(() => EventsOn("update-status", (status: string) => {
    if (status === "downloading") setUpdatePhase("downloading");
    else if (status === "installing") setUpdatePhase("installing");
  }), []);

  const handleUpdate = async () => {
    setInstalling(true);
    setUpdateError("");
    setProgress(-1);
    setUpdatePhase("downloading");
    try {
      await InstallUpdate();
    } catch (err) {
      setInstalling(false);
      setUpdateError(String(err));
    }
  };

  const dismissError = () => setUpdateError("");

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
        <SortableList ids={projectIds} onReorder={onReorder}>
          {projects.map((project) => {
            const isSelected = selected === project.name;
            const isRunning = hasStatus(project, STATUS_RUNNING);
            const isDone = hasStatus(project, STATUS_DONE);
            const isWaiting = hasStatus(project, STATUS_WAITING);
            const isError = hasStatus(project, STATUS_ERROR);
            const isDuplicating = duplicatingName === project.name;

            return (
              <SortableItem key={project.name} id={project.name}>
                <button
                  onClick={() => onSelect(project.name)}
                  onDoubleClick={() => {
                    if (getSettings().doubleClickToToggle) onToggle(project.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ name: project.name, x: e.clientX, y: e.clientY });
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {isDuplicating ? (
                    <span className="shrink-0 text-[var(--text-muted)]">
                      <SpinnerIcon />
                    </span>
                  ) : project.configError ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Config error" />
                  ) : (
                    <StatusDot running={project.running} />
                  )}
                  <span
                    className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate"
                    style={project.configError ? MUTED_STYLE : isDone ? DONE_STYLE : undefined}
                    title={project.configError || (project.parentName ? `Duplicate of ${project.parentName}` : undefined)}
                  >
                    <span className="truncate">
                      {isError ? (
                        <span className="text-red-400">{project.name}</span>
                      ) : isWaiting ? (
                        <span className="sidebar-waiting">{project.name}</span>
                      ) : isRunning ? (
                        <span className="sidebar-shimmer">{project.name}</span>
                      ) : project.name}
                    </span>
                    {project.parentName && (
                      <span className="shrink-0 truncate text-[10px] text-[var(--text-muted)]">
                        ↳ {project.parentName}
                      </span>
                    )}
                  </span>
                  {isError && <span className="shrink-0 text-red-400"><AlertCircleIcon /></span>}
                  {isDone && !isWaiting && !isError && <span className="shrink-0 text-[var(--accent-blue)]"><CheckIcon /></span>}
                </button>
              </SortableItem>
            );
          })}
        </SortableList>
      </nav>
      {contextMenu && (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          busy={duplicatingName !== null}
          canRemove={Boolean(contextProject?.parentName)}
          onDuplicate={() => onDuplicateProject(contextMenu.name)}
          onRemove={() => setConfirmRemoveDuplicate(contextMenu.name)}
          onClose={() => setContextMenu(null)}
        />
      )}
      <ConfirmDialog
        open={confirmRemoveDuplicate !== null}
        title="Remove duplicate"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Remove{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {confirmRemoveDuplicate}
            </span>
            ? Its folder will be deleted from disk.
          </>
        }
        onCancel={() => setConfirmRemoveDuplicate(null)}
        onConfirm={() => {
          if (confirmRemoveDuplicate) onRemoveProject(confirmRemoveDuplicate);
          setConfirmRemoveDuplicate(null);
        }}
      />

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

      <div className="flex flex-col p-2">
        <button
          onClick={onFeedback}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <HelpCircleIcon />
          Feedback
        </button>
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
        className="absolute inset-y-0 -right-2 w-4 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:-translate-x-1/2 before:w-1 hover:before:bg-[var(--accent-cyan)]/20 active:before:bg-[var(--accent-cyan)]/30"
      />
      {updateError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-8 py-6 shadow-2xl">
            <span className="text-red-400"><AlertCircleIcon /></span>
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Update failed</p>
              <p className="max-w-[240px] text-center text-[11px] text-[var(--text-muted)]">{updateError}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={dismissError} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]">
                Dismiss
              </button>
              <button onClick={handleUpdate} className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs text-black transition-opacity hover:opacity-80">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
      {installing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-8 py-6 shadow-2xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-[var(--accent-green)]">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {updatePhase === "downloading" ? "Downloading update..." : "Installing update..."}
              </p>
              {updatePhase === "downloading" && progress >= 0 ? (
                <ProgressBar value={progress} />
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">The app will restart automatically</p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
