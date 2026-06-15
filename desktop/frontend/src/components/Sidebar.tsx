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
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { BulkDuplicateDialog, type BulkDuplicateOptions } from "./BulkDuplicateDialog";
import { ProjectNameDisplay, projectDisplayName } from "./ProjectNameDisplay";
import { RenameModal } from "./RenameModal";
import { SelectionContextMenu } from "./SelectionContextMenu";
import { CheckboxBox } from "./ChangedFilesTree";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Tooltip } from "./ui/Tooltip";
import { SpinnerIcon } from "./project-detail/icons";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";
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
  onBulkDuplicate: (name: string, count: number, opts: BulkDuplicateOptions) => void;
  onRemoveProject: (name: string) => void;
  onRemoveProjectCascade: (name: string) => void;
  onRemoveProjectsBatch: (names: string[]) => void;
  onRenameProject: (name: string, label: string) => void;
  onReorder: (order: string[]) => void;
  onDetachProject: (name: string) => void;
  onAttachProject: (name: string) => void;
  detached: Set<string>;
  detachedSelf?: string;
  showTerminals: boolean;
  showSettings: boolean;
  duplicatingName: string | null;
  removingNames: Set<string>;
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

export function Sidebar({ projects, selected, collapsed, onCollapsedChange, onSelect, onToggle, onTerminals, onSettings, onAddProject, onBulkDuplicate, onRemoveProject, onRemoveProjectCascade, onRemoveProjectsBatch, onRenameProject, onReorder, onDetachProject, onAttachProject, detached, detachedSelf, showTerminals, showSettings, duplicatingName, removingNames }: SidebarProps) {
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1); // -1 = no progress yet
  const [updatePhase, setUpdatePhase] = useState<"checking" | "downloading" | "installing">("checking");
  const [updateError, setUpdateError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [bulkDuplicateName, setBulkDuplicateName] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
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

  // Leaving select mode (or running out of projects) clears the pending
  // selection; deleting projects drops their now-stale names from the set.
  useEffect(() => {
    if (!selectMode) return;
    if (rows.length === 0) {
      setSelectMode(false);
      return;
    }
    setSelectedForDelete((prev) => {
      const valid = new Set(rows.map((r) => r.project.name));
      const next = new Set([...prev].filter((n) => valid.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectMode, rows]);

  // Removing an original also removes its duplicates (matching the single
  // cascade delete), so expand the pending set before partitioning.
  const removalProjects = useMemo(() => {
    const names = new Set(selectedForDelete);
    for (const name of selectedForDelete) {
      const p = projectByName.get(name);
      if (p && !p.parentName) {
        for (const { project } of rows) {
          if (project.parentName === name) names.add(project.name);
        }
      }
    }
    return rows.filter((r) => names.has(r.project.name)).map((r) => r.project);
  }, [selectedForDelete, rows, projectByName]);

  // Duplicates have their folder deleted from disk; regular projects only lose
  // their lpm entry (source folder stays), so their removal needs the same
  // typed confirmation as the single delete flow.
  const foldersDeleted = removalProjects.filter((p) => p.parentName);
  const entriesRemoved = removalProjects.filter((p) => !p.parentName);
  // Mirror the single delete flow: removing a regular project requires typing
  // its name, so a batch asks for each regular project's name separately.
  const batchConfirmNames = entriesRemoved.map((p) => projectDisplayName(p));

  const enterSelectMode = (preselect?: string) => {
    setSelectedForDelete(preselect ? new Set([preselect]) : new Set());
    setSelectMode(true);
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedForDelete(new Set());
  };
  const toggleSelected = (name: string) =>
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Escape leaves select mode, but only when no menu is open (the open menu's
  // own Escape handler closes it first).
  useKeyboardShortcut({ key: "Escape" }, exitSelectMode, selectMode && !contextMenu);

  const renamingProject = renamingName ? projectByName.get(renamingName) : undefined;
  const renamingParent = renamingProject?.parentName
    ? projectByName.get(renamingProject.parentName)
    : undefined;

  const pendingRemove = confirmRemove ? projectByName.get(confirmRemove) : undefined;
  const pendingRemoveParent = pendingRemove?.parentName
    ? projectByName.get(pendingRemove.parentName)
    : undefined;
  const pendingRemoveLabel = pendingRemove
    ? projectDisplayName(pendingRemove, pendingRemoveParent)
    : "";
  const pendingRemoveDuplicates =
    pendingRemove && !pendingRemove.parentName
      ? projects.filter((p) => p.parentName === pendingRemove.name)
      : [];
  const dupCount = pendingRemoveDuplicates.length;
  const dupPlural = dupCount === 1 ? "" : "s";
  const removeMode: "duplicate" | "cascade" | "plain" = pendingRemove?.parentName
    ? "duplicate"
    : dupCount > 0
    ? "cascade"
    : "plain";
  const removeDialog =
    removeMode === "duplicate"
      ? {
          title: "Delete duplicate",
          confirmLabel: "Delete",
          confirmText: undefined as string | undefined,
          onConfirm: onRemoveProject,
          body: (
            <>
              Delete{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {pendingRemoveLabel}
              </span>
              ? Its folder and everything inside is permanently deleted from
              disk. This can't be undone.
            </>
          ),
        }
      : removeMode === "cascade"
      ? {
          title: `Delete project and ${dupCount} duplicate${dupPlural}`,
          confirmLabel: "Delete",
          confirmText: pendingRemoveLabel,
          onConfirm: onRemoveProjectCascade,
          body: (
            <>
              Deleting{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {pendingRemoveLabel}
              </span>{" "}
              also permanently deletes its {dupCount} duplicate{dupPlural} from
              disk:
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {pendingRemoveDuplicates.map((dup) => (
                  <li key={dup.name} className="text-[var(--text-primary)]">
                    {projectDisplayName(dup, pendingRemove)}
                  </li>
                ))}
              </ul>
              <span className="mt-2 block">
                The original's source folder stays on disk — only the duplicate
                copies are deleted. This can't be undone.
              </span>
            </>
          ),
        }
      : {
          title: "Remove project",
          confirmLabel: "Remove",
          confirmText: pendingRemoveLabel,
          onConfirm: onRemoveProject,
          body: (
            <>
              Remove{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {pendingRemoveLabel}
              </span>{" "}
              from lpm? This stops any running session and removes the project
              entry. Your source folder stays on disk, so you can add it back
              anytime.
            </>
          ),
        };

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
      .catch((err) => console.warn("update check failed:", err));
  }, []);
  useEffect(() => EventsOn("update-progress", (pct: number) => setProgress(pct)), []);
  useEffect(() => EventsOn("update-status", (status: string) => {
    if (status === "checking") setUpdatePhase("checking");
    else if (status === "downloading") setUpdatePhase("downloading");
    else if (status === "installing") setUpdatePhase("installing");
  }), []);

  const handleUpdate = async () => {
    setInstalling(true);
    setUpdateError("");
    setProgress(-1);
    setUpdatePhase("checking");
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
        {selectMode ? (
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {selectedForDelete.size} selected
          </span>
        ) : (
          <button
            onClick={onAddProject}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Add project"
          >
            +
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        <SortableList ids={topLevelNames} onReorder={handleReorder}>
          {rows.map(({ project, isChild }) => {
            const status = computeStatus(project);
            const isDetached = detached.has(project.name);
            const isSelf = project.name === detachedSelf;
            const isSelected = selected === project.name && (!isDetached || isSelf);
            const isContextTarget = contextMenu?.name === project.name;
            const isBusy = duplicatingName === project.name || removingNames.has(project.name);
            const parent = project.parentName ? projectByName.get(project.parentName) : undefined;
            const name = <ProjectNameDisplay project={project} parent={parent} />;
            const showCheck = status.isDone && !status.isWaiting && !status.isError;
            const isChecked = selectedForDelete.has(project.name);

            const buttonClass = selectMode
              ? `${ROW_BASE_CLASS} ${
                  isChecked
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`
              : `${ROW_BASE_CLASS} ${
                  isContextTarget
                    ? "pr-9 ring-1 ring-inset ring-[var(--accent-cyan)]/60"
                    : "group-hover:pr-9"
                } ${
                  isSelected
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`;

            const rowItem = (
              <div className="group relative">
                <button
                  onClick={
                    selectMode
                      ? () => toggleSelected(project.name)
                      : () => onSelect(project.name)
                  }
                  onDoubleClick={
                    selectMode
                      ? undefined
                      : () => {
                          if (getSettings().doubleClickToToggle) onToggle(project.name);
                        }
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ name: project.name, x: e.clientX, y: e.clientY });
                  }}
                  className={buttonClass}
                >
                  {selectMode ? (
                    <span className="shrink-0">
                      <CheckboxBox
                        state={isChecked ? "all" : "none"}
                        tone={project.running ? "green" : "blue"}
                      />
                    </span>
                  ) : isBusy ? (
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
                {!selectMode && (
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
                )}
              </div>
            );

            if (isChild || selectMode) {
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
      {contextMenu &&
        (selectMode ? (
          <SelectionContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            count={selectedForDelete.size}
            busy={removingNames.size > 0}
            onDelete={() => {
              if (selectedForDelete.size > 0) setConfirmBatch(true);
            }}
            onCancel={exitSelectMode}
            onClose={() => setContextMenu(null)}
          />
        ) : (
          <ProjectContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            busy={duplicatingName !== null || removingNames.size > 0}
            isDuplicate={Boolean(contextProject?.parentName)}
            isDetached={detached.has(contextMenu.name)}
            canSelect={projects.length > 1}
            projectPath={contextProject?.root ?? null}
            onRename={() => setRenamingName(contextMenu.name)}
            onBulkDuplicate={() => setBulkDuplicateName(contextMenu.name)}
            onCopyPath={() => {
              if (contextProject?.root) navigator.clipboard.writeText(contextProject.root);
            }}
            onDetach={() => onDetachProject(contextMenu.name)}
            onAttach={() => onAttachProject(contextMenu.name)}
            onSelect={() => enterSelectMode(contextMenu.name)}
            onRemove={() => setConfirmRemove(contextMenu.name)}
            onClose={() => setContextMenu(null)}
          />
        ))}
      <ConfirmDialog
        open={confirmRemove !== null}
        title={removeDialog.title}
        variant="destructive"
        confirmLabel={removeDialog.confirmLabel}
        confirmText={removeDialog.confirmText || undefined}
        body={removeDialog.body}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) removeDialog.onConfirm(confirmRemove);
          setConfirmRemove(null);
        }}
      />
      <ConfirmDialog
        open={confirmBatch}
        title={
          entriesRemoved.length === 0
            ? `Delete ${removalProjects.length} ${removalProjects.length === 1 ? "copy" : "copies"}`
            : `Delete ${removalProjects.length} ${removalProjects.length === 1 ? "project" : "projects"}`
        }
        variant="destructive"
        confirmLabel="Delete"
        confirmText={batchConfirmNames.length > 0 ? batchConfirmNames : undefined}
        body={
          <>
            {removalProjects.length === 1
              ? "Delete this project?"
              : `Delete these ${removalProjects.length} projects?`}
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
              {removalProjects.map((p) => (
                <li key={p.name} className="text-[var(--text-primary)]">
                  {projectDisplayName(p, projectByName.get(p.parentName ?? ""))}
                </li>
              ))}
            </ul>
            {foldersDeleted.length > 0 && (
              <span className="mt-2 block">
                {foldersDeleted.length === 1
                  ? "1 copy and everything inside is permanently deleted from disk."
                  : `${foldersDeleted.length} copies and everything inside are permanently deleted from disk.`}{" "}
                This can't be undone.
              </span>
            )}
            {entriesRemoved.length > 0 && (
              <span className="mt-2 block">
                {entriesRemoved.length === 1
                  ? "1 project is removed from lpm; its source folder stays on disk."
                  : `${entriesRemoved.length} projects are removed from lpm; their source folders stay on disk.`}
              </span>
            )}
          </>
        }
        onCancel={() => setConfirmBatch(false)}
        onConfirm={() => {
          const names = removalProjects.map((p) => p.name);
          setConfirmBatch(false);
          exitSelectMode();
          if (names.length > 0) onRemoveProjectsBatch(names);
        }}
      />
      <BulkDuplicateDialog
        open={bulkDuplicateName !== null}
        project={bulkDuplicateName ? projectByName.get(bulkDuplicateName) ?? null : null}
        busy={duplicatingName !== null}
        onCancel={() => setBulkDuplicateName(null)}
        onConfirm={(count, opts) => {
          if (bulkDuplicateName) onBulkDuplicate(bulkDuplicateName, count, opts);
          setBulkDuplicateName(null);
        }}
      />
      <RenameModal
        open={renamingName !== null}
        title="Rename project"
        initialValue={
          renamingProject ? projectDisplayName(renamingProject, renamingParent) : ""
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
                {updatePhase === "checking"
                  ? "Checking for updates..."
                  : updatePhase === "downloading"
                  ? "Downloading update..."
                  : "Installing update..."}
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
