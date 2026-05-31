import { useEffect, useMemo, useState } from "react";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../store/settings";
import { EventsOn } from "../../bridge/runtime";
import { CheckForUpdate, InstallUpdate } from "../../bridge/commands";
import { type ProjectInfo, STATUS_RUNNING, STATUS_DONE, STATUS_WAITING, STATUS_ERROR } from "../types";
import { SidebarIcon, CheckIcon, AlertCircleIcon, BellIcon, MoreVerticalIcon, DetachIcon, TerminalIcon } from "./icons";
import { ProgressBar } from "./ui/ProgressBar";
import { SortableItem, SortableList } from "./ui/SortableList";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ProjectNameDisplay } from "./ProjectNameDisplay";
import { RenameModal } from "./RenameModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Tooltip } from "./ui/Tooltip";
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
  onTerminals: () => void;
  onSettings: () => void;
  onAddProject: () => void;
  onDuplicateProject: (name: string, excludeUncommitted?: boolean) => void;
  onRemoveProject: (name: string) => void;
  onRenameProject: (name: string, label: string) => void;
  onReorder: (order: string[]) => void;
  onDetachProject: (name: string) => void;
  onAttachProject: (name: string) => void;
  detached: Set<string>;
  detachedSelf?: string;
  showTerminals: boolean;
  showSettings: boolean;
  duplicatingName: string | null;
  removingName: string | null;
}

interface ProjectStatus {
  isRunning: boolean;
  isDone: boolean;
  isWaiting: boolean;
  isError: boolean;
  className: string | null;
}

function computeStatus(project: ProjectInfo): ProjectStatus {
  const entries = project.statusEntries ?? [];
  const has = (v: string) => entries.some((e) => e.value === v);
  const isRunning = has(STATUS_RUNNING);
  const isDone = has(STATUS_DONE);
  const isWaiting = has(STATUS_WAITING);
  const isError = has(STATUS_ERROR);
  const className = isError
    ? "text-red-400"
    : isWaiting
    ? "sidebar-waiting"
    : isRunning
    ? "sidebar-shimmer"
    : null;
  return { isRunning, isDone, isWaiting, isError, className };
}

export function Sidebar({ projects, selected, collapsed, onCollapsedChange, onSelect, onToggle, onTerminals, onSettings, onAddProject, onDuplicateProject, onRemoveProject, onRenameProject, onReorder, onDetachProject, onAttachProject, detached, detachedSelf, showTerminals, showSettings, duplicatingName, removingName }: SidebarProps) {
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1); // -1 = no progress yet
  const [updatePhase, setUpdatePhase] = useState<"downloading" | "installing">("downloading");
  const [updateError, setUpdateError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [confirmRemoveDuplicate, setConfirmRemoveDuplicate] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const { width, handleResizeStart } = useSidebarResize();

  const contextProject = contextMenu
    ? projects.find((p) => p.name === contextMenu.name)
    : null;

  // Backend guarantees duplicates sit immediately after their parent; we
  // only need to mark children so they render without a drag handle.
  const { rows, topLevelNames, projectByName } = useMemo(() => {
    const byName = new Map<string, ProjectInfo>();
    for (const p of projects) byName.set(p.name, p);
    const outRows: { project: ProjectInfo; isChild: boolean }[] = [];
    const outTop: string[] = [];
    for (const p of projects) {
      const isChild = Boolean(p.parentName && byName.has(p.parentName));
      outRows.push({ project: p, isChild });
      if (!isChild) outTop.push(p.name);
    }
    return { rows: outRows, topLevelNames: outTop, projectByName: byName };
  }, [projects]);

  // Backend stores a flat order; expand the dragged top-level list with
  // each parent's duplicates so the optimistic client-side sort matches
  // the normalized order the backend returns on next read.
  const handleReorder = (newTopOrder: string[]) => {
    const childrenByParent = new Map<string, string[]>();
    for (const { project } of rows) {
      const parentName = project.parentName;
      if (!parentName || !projectByName.has(parentName)) continue;
      const list = childrenByParent.get(parentName);
      if (list) list.push(project.name);
      else childrenByParent.set(parentName, [project.name]);
    }
    const flat: string[] = [];
    for (const name of newTopOrder) {
      flat.push(name);
      const kids = childrenByParent.get(name);
      if (kids) flat.push(...kids);
    }
    onReorder(flat);
  };

  useEffect(() => EventsOn("update-available", setUpdateInfo), []);
  useEffect(() => {
    CheckForUpdate()
      .then((info) => { if (info.updateAvail) setUpdateInfo(info); })
      .catch(() => {});
  }, []);
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
      <div
        className="app-drag flex h-11 shrink-0 items-center justify-end pr-3 pt-[7px]"
        style={{ minWidth: width }}
      >
        <div className={collapsed ? "opacity-0 pointer-events-none" : "opacity-100"}>
          <button
            onClick={() => onCollapsedChange(true)}
            style={{ "--app-draggable": "no-drag" } as React.CSSProperties}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Collapse sidebar (⌘B)"
          >
            <SidebarIcon />
          </button>
        </div>
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
        <SortableList ids={topLevelNames} onReorder={handleReorder}>
          {rows.map(({ project, isChild }) => {
            const status = computeStatus(project);
            const isDetached = detached.has(project.name);
            const isSelf = project.name === detachedSelf;
            const isSelected = selected === project.name && (!isDetached || isSelf);
            const isContextTarget = contextMenu?.name === project.name;
            const isBusy = duplicatingName === project.name || removingName === project.name;
            const parent = project.parentName ? projectByName.get(project.parentName) : undefined;
            const name = <ProjectNameDisplay project={project} parent={parent} />;
            const showCheck = status.isDone && !status.isWaiting && !status.isError;

            const rowItem = (
              <div className="group relative">
                <button
                  onClick={() => onSelect(project.name)}
                  onDoubleClick={() => {
                    if (getSettings().doubleClickToToggle) onToggle(project.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ name: project.name, x: e.clientX, y: e.clientY });
                  }}
                  className={`flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isContextTarget
                      ? "pr-9 ring-1 ring-inset ring-[var(--accent-cyan)]/60"
                      : "group-hover:pr-9"
                  } ${
                    isSelected
                      ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {isBusy ? (
                    <span className="shrink-0 text-[var(--text-muted)]">
                      <SpinnerIcon />
                    </span>
                  ) : project.configError ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Config error" />
                  ) : (
                    <StatusDot running={project.running} />
                  )}
                  <span
                    className="truncate"
                    style={project.configError ? MUTED_STYLE : status.isDone ? DONE_STYLE : undefined}
                    title={project.configError || (project.parentName ? `Duplicate of ${project.parentName}` : undefined)}
                  >
                    {status.className ? <span className={status.className}>{name}</span> : name}
                  </span>
                  {isDetached && !isSelf && (
                    <span
                      className="shrink-0 text-[var(--text-muted)]"
                      title="Open in a separate window — click to focus"
                    >
                      <DetachIcon />
                    </span>
                  )}
                  {status.isError && <span className="shrink-0 text-red-400"><AlertCircleIcon /></span>}
                  {showCheck && <span className="shrink-0 text-[var(--accent-blue)]"><CheckIcon /></span>}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // useOutsideClick's mousedown already closed the menu — skip the reopen so the second click toggles off.
                    if (isContextTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({ name: project.name, x: rect.left, y: rect.bottom + 4 });
                  }}
                  className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                    isContextTarget
                      ? "opacity-100"
                      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                  }`}
                  title="More options"
                  aria-label={`More options for ${project.name}`}
                >
                  <MoreVerticalIcon />
                </button>
              </div>
            );

            if (isChild) {
              return <div key={project.name}>{rowItem}</div>;
            }
            return (
              <SortableItem key={project.name} id={project.name}>
                {rowItem}
              </SortableItem>
            );
          })}
        </SortableList>
      </nav>
      {contextMenu && (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          busy={duplicatingName !== null || removingName !== null}
          canRemove={Boolean(contextProject?.parentName)}
          isDetached={detached.has(contextMenu.name)}
          projectPath={contextProject?.root ?? null}
          onRename={() => setRenamingName(contextMenu.name)}
          onDuplicate={() => onDuplicateProject(contextMenu.name)}
          onDuplicateExcludeUncommitted={() => onDuplicateProject(contextMenu.name, true)}
          onCopyPath={() => {
            if (contextProject?.root) navigator.clipboard.writeText(contextProject.root);
          }}
          onDetach={() => onDetachProject(contextMenu.name)}
          onAttach={() => onAttachProject(contextMenu.name)}
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
      <RenameModal
        open={renamingName !== null}
        title="Rename project"
        initialValue={
          renamingName
            ? projectByName.get(renamingName)?.label ?? renamingName
            : ""
        }
        onClose={() => setRenamingName(null)}
        onSubmit={(value) => {
          if (renamingName) onRenameProject(renamingName, value);
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
        <Tooltip
          content="Quick shells for scripts, system commands, and anything not tied to a project."
          side="right"
          wide
          triggerClassName="flex w-full"
        >
          <button
            onClick={onTerminals}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              showTerminals
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <TerminalIcon />
            Terminals
          </button>
        </Tooltip>
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
