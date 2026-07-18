import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { StatusDot } from "./StatusDot";
import { getSettings } from "../store/settings";
import { EventsOn } from "../../bridge/runtime";
import { CheckForUpdate, InstallUpdate } from "../../bridge/commands";
import { isDuplicate, type ProjectGroup, type ProjectInfo, STATUS_RUNNING, STATUS_DONE, STATUS_WAITING, STATUS_ERROR } from "../types";
import { SidebarIcon, CheckIcon, AlertCircleIcon, MoreVerticalIcon, DetachIcon, TerminalIcon, StatsIcon } from "./icons";
import { SidebarFooterMore } from "./SidebarFooterMore";
import { SidebarAgentToolsPill } from "./SidebarAgentToolsPill";
import { ProgressBar } from "./ui/ProgressBar";
import { SortableItem } from "./ui/SortableList";
import {
  type SidebarLayout,
  classify,
  dropFolderTarget,
  expandRemovalSet,
  folderBodyId,
  folderNestId,
  groupById,
  groupIdOf,
  groupToken,
  membershipMap,
  rangeBetween,
  resolveSidebarDrop,
} from "./sidebarLayout";
import { SidebarGroupRow } from "./SidebarGroupRow";
import { GroupContextMenu } from "./GroupContextMenu";
import { FolderDropZone } from "./FolderDropZone";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ProjectGitModals, type GitModalTarget } from "./ProjectGitModals";
import { BulkDuplicateDialog, type BulkDuplicateOptions } from "./BulkDuplicateDialog";
import { ProjectNameDisplay, projectDisplayName } from "./ProjectNameDisplay";
import { RenameModal } from "./RenameModal";
import { ProjectRenameModal } from "./ProjectRenameModal";
import { SelectionContextMenu } from "./SelectionContextMenu";
import { RemovalSummary } from "./RemovalSummary";
import { CheckboxBox } from "./ChangedFilesTree";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Tooltip } from "./ui/Tooltip";
import { SpinnerIcon } from "./project-detail/icons";
import { SidebarPeerSection } from "./SidebarPeerSection";
import { isPeerName, peerSlugOf, stripMarker } from "../peer/markers";
import { usePeerState } from "../peer/usePeerState";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";
const MUTED_STYLE = { color: "var(--text-muted)" } as const;
const DONE_STYLE = { color: "var(--accent-blue)" } as const;

interface SidebarProps {
  projects: ProjectInfo[];
  groups: ProjectGroup[];
  sidebarOrder: string[];
  selected: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  onTerminals: () => void;
  onStats: () => void;
  onScheduled: () => void;
  onFeedback: () => void;
  onSettings: () => void;
  onAddProject: () => void;
  onBulkDuplicate: (name: string, count: number, opts: BulkDuplicateOptions) => void;
  onRemoveProject: (name: string) => void;
  onRemoveProjectCascade: (name: string) => void;
  onRemoveProjectFromDisk: (name: string) => void;
  onRemoveProjectsBatch: (names: string[]) => void;
  onRenameProject: (name: string, label: string) => void;
  onMoveProjectRoot: (name: string, newRoot: string) => Promise<void>;
  onApplySidebarLayout: (layout: SidebarLayout) => void;
  onCreateGroup: (name: string, opts?: { initialMembers?: string[] }) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onToggleGroupCollapsed: (id: string) => void;
  onMoveProjectToGroup: (name: string, groupId: string | null) => void;
  onMoveProjectsToGroup: (names: string[], groupId: string | null) => void;
  onDetachProject: (name: string) => void;
  onAttachProject: (name: string) => void;
  detached: Set<string>;
  detachedSelf?: string;
  showTerminals: boolean;
  showStats: boolean;
  showScheduled: boolean;
  showSettings: boolean;
  duplicatingNames: string[];
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

// One rendered sidebar row: a folder header, a project (loose, member, or
// duplicate), or the empty-folder drop target.
type TreeItem =
  | { kind: "group"; group: ProjectGroup }
  | { kind: "project"; project: ProjectInfo; isChild: boolean; folderId?: string }
  | { kind: "empty"; group: ProjectGroup };

export function Sidebar({ projects, groups, sidebarOrder, selected, collapsed, onCollapsedChange, onSelect, onToggle, onTerminals, onStats, onScheduled, onFeedback, onSettings, onAddProject, onBulkDuplicate, onRemoveProject, onRemoveProjectCascade, onRemoveProjectFromDisk, onRemoveProjectsBatch, onRenameProject, onMoveProjectRoot, onApplySidebarLayout, onCreateGroup, onRenameGroup, onDeleteGroup, onToggleGroupCollapsed, onMoveProjectToGroup, onMoveProjectsToGroup, onDetachProject, onAttachProject, detached, detachedSelf, showTerminals, showStats, showScheduled, showSettings, duplicatingNames, removingNames }: SidebarProps) {
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1); // -1 = no progress yet
  const [updatePhase, setUpdatePhase] = useState<"checking" | "downloading" | "installing">("checking");
  const [updateError, setUpdateError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  // null = closed; otherwise the create-folder modal is open, optionally
  // seeded with a project to drop into the new folder.
  const [createFolder, setCreateFolder] = useState<{ initialMembers?: string[] } | null>(null);
  const [bulkDuplicateName, setBulkDuplicateName] = useState<string | null>(null);
  const [gitModal, setGitModal] = useState<GitModalTarget | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  // Anchor row for shift-click range selection; range spans anchor → clicked.
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { width, handleResizeStart } = useSidebarResize();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const layoutRef = useRef<SidebarLayout>({ order: sidebarOrder, groups });
  layoutRef.current = { order: sidebarOrder, groups };

  // Remote (peer) projects render in their own sections below the local ones;
  // they never take part in folders, drag-reorder, or select-mode.
  const { state: peerState } = usePeerState();
  const localProjects = useMemo(() => projects.filter((p) => !isPeerName(p.name)), [projects]);
  const peerSections = useMemo(() => {
    const bySlug = new Map<string, ProjectInfo[]>();
    for (const p of projects) {
      const slug = peerSlugOf(p.name);
      if (!slug) continue;
      const arr = bySlug.get(slug);
      if (arr) arr.push(p);
      else bySlug.set(slug, [p]);
    }
    // A connected peer always gets a section, even with no projects yet, so its
    // header (and the add-project button in it) is reachable on a fresh host.
    return peerState.peers
      .filter((peer) => peer.connected)
      .map((peer) => ({
        slug: peer.slug,
        alias: peer.alias || peer.host,
        projects: bySlug.get(peer.slug) ?? [],
      }));
  }, [projects, peerState.peers]);

  const contextProject = contextMenu
    ? projects.find((p) => p.name === contextMenu.name)
    : null;

  // Lookup across BOTH local and peer projects. projectByName (built later) holds
  // only local projects since it drives the reorderable tree; context-menu-driven
  // modals (rename / remove / duplicate) must resolve a peer row's target too.
  const allByName = useMemo(() => new Map(projects.map((p) => [p.name, p])), [projects]);

  const openGitModal = (kind: GitModalTarget["kind"]) => {
    if (contextProject?.root && contextMenu) {
      setGitModal({ name: contextMenu.name, path: contextProject.root, kind });
    }
  };

  // Build the rendered tree from projects + folders + the interleaved order.
  // Duplicates ride immediately after their parent; brand-new projects not yet
  // in the persisted order are appended loose so they never vanish.
  const { items, sortableIds, projectByName, memberOf } = useMemo(() => {
    const byName = new Map<string, ProjectInfo>();
    for (const p of localProjects) byName.set(p.name, p);
    const membership = membershipMap(groups);
    // Duplicates nest under their parent — unless one was explicitly placed in a
    // folder, in which case it renders there as a standalone member instead.
    const childrenByParent = new Map<string, ProjectInfo[]>();
    for (const p of localProjects) {
      if (isDuplicate(p, byName) && !membership.has(p.name)) {
        const arr = childrenByParent.get(p.parentName!);
        if (arr) arr.push(p);
        else childrenByParent.set(p.parentName!, [p]);
      }
    }
    const groupsById = new Map(groups.map((g) => [g.id, g]));

    const out: TreeItem[] = [];
    const ids: string[] = [];
    const rendered = new Set<string>();
    const pushProject = (p: ProjectInfo, folderId?: string) => {
      out.push({ kind: "project", project: p, isChild: false, folderId });
      ids.push(p.name);
      rendered.add(p.name);
      for (const child of childrenByParent.get(p.name) ?? []) {
        out.push({ kind: "project", project: child, isChild: true, folderId });
        rendered.add(child.name);
      }
    };

    const seenGroups = new Set<string>();
    const emitGroup = (g: ProjectGroup) => {
      seenGroups.add(g.id);
      const members = g.members
        .map((n) => byName.get(n))
        .filter((p): p is ProjectInfo => !!p);
      out.push({ kind: "group", group: g });
      ids.push(groupToken(g.id));
      if (!g.collapsed) {
        if (members.length === 0) out.push({ kind: "empty", group: g });
        for (const mp of members) pushProject(mp, g.id);
      } else {
        members.forEach((mp) => rendered.add(mp.name));
      }
    };
    for (const token of sidebarOrder) {
      const id = groupIdOf(token);
      if (id !== null) {
        const g = groupsById.get(id);
        if (g && !seenGroups.has(id)) emitGroup(g);
      } else {
        const p = byName.get(token);
        if (!p || rendered.has(token)) continue;
        if (isDuplicate(p, byName)) continue;
        if (membership.has(token)) continue;
        pushProject(p);
      }
    }
    // Folders missing from the order (defensive — reconcile normally adds them).
    for (const g of groups) {
      if (!seenGroups.has(g.id)) emitGroup(g);
    }
    // Brand-new loose projects not yet persisted into the order.
    for (const p of localProjects) {
      if (rendered.has(p.name)) continue;
      if (isDuplicate(p, byName)) continue;
      if (membership.has(p.name)) continue;
      pushProject(p);
    }
    return { items: out, sortableIds: ids, projectByName: byName, memberOf: membership };
  }, [localProjects, groups, sidebarOrder]);

  // Project names in rendered top-to-bottom order — the axis a shift-click
  // range is measured along. Collapsed-folder members aren't rendered, so they
  // fall outside any range, matching what the user can actually see.
  const visualProjectNames = useMemo(
    () => items.flatMap((it) => (it.kind === "project" ? [it.project.name] : [])),
    [items],
  );

  // Leaving select mode (or running out of projects) clears the pending
  // selection; deleting projects drops their now-stale names from the set.
  useEffect(() => {
    if (!selectMode) return;
    if (projects.length === 0) {
      setSelectMode(false);
      return;
    }
    setSelectedForDelete((prev) => {
      const valid = new Set(projects.map((p) => p.name));
      const next = new Set([...prev].filter((n) => valid.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectMode, projects]);

  // Removing an original also removes its duplicates (matching the single
  // cascade delete), so expand the pending set before partitioning.
  const removalProjects = useMemo(
    () => expandRemovalSet(projects, projectByName, selectedForDelete),
    [selectedForDelete, projects, projectByName],
  );

  // Originals only lose their lpm entry (source folder stays), so their removal
  // needs the same typed confirmation as the single delete flow; duplicates
  // (deleted from disk) need none.
  const entriesRemoved = removalProjects.filter((p) => !p.parentName);
  const batchConfirmNames = entriesRemoved.map((p) => projectDisplayName(p));

  const enterSelectMode = (preselect?: string) => {
    setSelectedForDelete(preselect ? new Set([preselect]) : new Set());
    setSelectionAnchor(preselect ?? null);
    setSelectMode(true);
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedForDelete(new Set());
    setSelectionAnchor(null);
  };
  const toggleSelected = (name: string) =>
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Clicking a project row. Shift-click selects the inclusive range from the
  // anchor (the last row clicked) to the clicked row, entering select mode and
  // adding to whatever is selected. A plain click navigates, or toggles one row
  // when already in select mode. The anchor tracks the last row the user
  // actually clicked rather than the open project — they diverge for detached
  // rows (which only focus a window) and across non-project views.
  const handleRowClick = (name: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const anchor = selectionAnchor ?? name;
      const range = rangeBetween(visualProjectNames, anchor, name);
      const add = range.length > 0 ? range : [name];
      setSelectedForDelete((prev) => new Set([...prev, ...add]));
      if (!selectMode) setSelectMode(true);
      // Keep extending from the original anchor across shift-clicks, but
      // re-seed to the clicked row once that anchor is gone (e.g. its project
      // was removed) so range selection can't get stuck.
      setSelectionAnchor((prev) => (prev && visualProjectNames.includes(prev) ? prev : name));
      return;
    }
    if (selectMode) {
      toggleSelected(name);
    } else {
      onSelect(name);
    }
    setSelectionAnchor(name);
  };

  // Escape leaves select mode, but only when no menu is open (the open menu's
  // own Escape handler closes it first).
  useKeyboardShortcut({ key: "Escape" }, exitSelectMode, selectMode && !contextMenu && !groupMenu);

  const renamingProject = renamingName ? allByName.get(renamingName) : undefined;
  const renamingParent = renamingProject?.parentName
    ? allByName.get(renamingProject.parentName)
    : undefined;
  const renamingGroup = renamingGroupId ? groups.find((g) => g.id === renamingGroupId) : undefined;
  const deletingGroup = deletingGroupId ? groups.find((g) => g.id === deletingGroupId) : undefined;

  // Deleting a folder deletes everything inside it, under the same rules as the
  // batch/single delete: each original project requires typing its name, while
  // duplicate copies are deleted from disk without confirmation.
  const groupRemovalProjects = useMemo(
    () => (deletingGroup ? expandRemovalSet(projects, projectByName, deletingGroup.members) : []),
    [deletingGroup, projects, projectByName],
  );
  const groupConfirmNames = groupRemovalProjects
    .filter((p) => !p.parentName)
    .map((p) => projectDisplayName(p));
  const groupRemovalCount = groupRemovalProjects.length;
  const deleteFolderTitle =
    groupRemovalCount === 0
      ? "Delete folder"
      : groupConfirmNames.length === 0
      ? `Delete folder and ${groupRemovalCount} ${groupRemovalCount === 1 ? "copy" : "copies"}`
      : `Delete folder and ${groupRemovalCount} ${groupRemovalCount === 1 ? "project" : "projects"}`;

  const pendingRemove = confirmRemove ? allByName.get(confirmRemove) : undefined;
  const pendingRemoveParent = pendingRemove?.parentName
    ? allByName.get(pendingRemove.parentName)
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

  const pendingTrash = confirmTrash ? allByName.get(confirmTrash) : undefined;
  const pendingTrashLabel = pendingTrash ? projectDisplayName(pendingTrash) : "";
  const trashDupCount = pendingTrash
    ? projects.filter((p) => p.parentName === pendingTrash.name).length
    : 0;
  const trashDupPlural = trashDupCount === 1 ? "" : "s";

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

  // Folder drop zones win over reorder only when a PROJECT is dragged onto a
  // folder it doesn't already belong to; folders themselves only reorder.
  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const active = String(args.active.id);
      // Reorder fallback never picks a folder zone (those only nest) or self.
      const reorderFallback = () => {
        const measurable = args.droppableContainers.filter((c) => {
          const id = String(c.id);
          if (id === active || dropFolderTarget(id) !== null) return false;
          const rect = c.rect.current;
          return !!rect && rect.width > 0 && rect.height > 0;
        });
        return closestCenter({ ...args, droppableContainers: measurable });
      };

      const pointer = pointerWithin(args);
      if (pointer.length === 0) return reorderFallback();

      const node = classify(layoutRef.current, active);
      if (node && node.kind !== "group") {
        for (const c of pointer) {
          const target = dropFolderTarget(String(c.id));
          if (target === null) continue;
          if (node.kind === "member" && node.groupId === target) continue;
          return [c];
        }
      }
      const items = pointer.filter((c) => {
        const id = String(c.id);
        return dropFolderTarget(id) === null && id !== active;
      });
      return items.length > 0 ? [items[0]] : reorderFallback();
    },
    [],
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragCancel = () => setActiveId(null);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const next = resolveSidebarDrop(layoutRef.current, String(active.id), String(over.id));
    if (next) onApplySidebarLayout(next);
  };

  const renderProjectRow = (project: ProjectInfo) => {
    const status = computeStatus(project);
    const isDetached = detached.has(project.name);
    const isSelf = project.name === detachedSelf;
    // A detached project is now mirrored (live in both windows), so the main
    // window highlights it when selected like any other project.
    const isSelected = selected === project.name;
    const isContextTarget = contextMenu?.name === project.name;
    const isBusy = duplicatingNames.includes(project.name) || removingNames.has(project.name);
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

    return (
      <div className="group relative">
        <button
          onClick={(e) => handleRowClick(project.name, e)}
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
              title="Also open in a separate window"
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
            onPointerDown={(e) => e.stopPropagation()}
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
  };

  const renderRow = (item: TreeItem) => {
    if (item.kind === "group") {
      const header = (
        <SidebarGroupRow
          group={item.group}
          collapsed={!!item.group.collapsed}
          count={item.group.members.length}
          selectMode={selectMode}
          isContextTarget={groupMenu?.id === item.group.id}
          onToggle={() => onToggleGroupCollapsed(item.group.id)}
          onMore={(x, y) => setGroupMenu({ id: item.group.id, x, y })}
        />
      );
      if (selectMode) return <div key={groupToken(item.group.id)}>{header}</div>;
      return (
        <SortableItem key={groupToken(item.group.id)} id={groupToken(item.group.id)}>
          <div className="relative">
            {header}
            <FolderDropZone id={folderNestId(item.group.id)} overlay />
          </div>
        </SortableItem>
      );
    }

    if (item.kind === "empty") {
      const emptyClass = "mb-0.5 rounded-md px-3 py-1.5 text-[11px] italic text-[var(--text-muted)]";
      if (selectMode) {
        return <div key={`empty-${item.group.id}`} className={emptyClass}>Empty</div>;
      }
      return (
        <FolderDropZone key={`empty-${item.group.id}`} id={folderBodyId(item.group.id)} className={emptyClass}>
          Empty — drop projects here
        </FolderDropZone>
      );
    }

    const { project, isChild } = item;
    const row = renderProjectRow(project);
    if (isChild || selectMode) {
      return <div key={project.name}>{row}</div>;
    }
    return (
      <SortableItem key={project.name} id={project.name}>
        {row}
      </SortableItem>
    );
  };

  const overlayContent = (() => {
    if (!activeId) return null;
    const gid = groupIdOf(activeId);
    if (gid !== null) {
      const g = groupById(groups, gid);
      return g ? <span className="truncate font-medium">{g.name}</span> : null;
    }
    const p = projectByName.get(activeId);
    return p ? (
      <span className="truncate">{projectDisplayName(p, p.parentName ? projectByName.get(p.parentName) : undefined)}</span>
    ) : null;
  })();

  // A folder header plus its (expanded) member rows render inside one block, tied
  // together by a tree connector: a vertical trunk that drops from the folder's
  // disclosure arrow, with a rounded elbow curving out to each member. The last
  // member ends the trunk at its own elbow. The connector lives in the left
  // gutter (left of the status dot), in existing row padding — so no project name
  // is indented into less usable width.
  // Same sky blue as the composer's image chip (IMAGE_CHIP_CLASS); constant color
  // — it doesn't react to row/folder hover.
  const TRUNK_BG = "bg-[#38bdf8]/55";
  const ELBOW_BORDER = "border-[#38bdf8]/55";
  const renderFolderBlock = (
    groupItem: Extract<TreeItem, { kind: "group" }>,
    body: TreeItem[],
  ) => {
    let lastProjectIndex = -1;
    body.forEach((it, i) => {
      if (it.kind === "project") lastProjectIndex = i;
    });
    const hasProjects = lastProjectIndex !== -1;
    // Connectors are absolute siblings of the sortable rows, so a live drag's
    // row transform would leave them stranded — hide the whole tree while any
    // drag is active; it reappears on drop.
    const showConnectors = !activeId;
    return (
      <div key={groupToken(groupItem.group.id)} className="mt-1 first:mt-0">
        <div className="relative">
          {renderRow(groupItem)}
          {hasProjects && showConnectors && (
            <>
              <span
                aria-hidden
                className={`pointer-events-none absolute left-[4px] top-[9px] z-10 h-[11px] w-[11.5px] rounded-t-[6px] border-l border-r border-t ${ELBOW_BORDER}`}
              />
              <span
                aria-hidden
                className={`pointer-events-none absolute left-[4px] top-[20px] bottom-0 z-10 w-px ${TRUNK_BG}`}
              />
            </>
          )}
        </div>
        {body.length > 0 && (
          <div className="relative">
            {body.map((it, i) =>
              it.kind === "project" ? (
                <div key={it.project.name} className="relative">
                  {showConnectors && (
                    <>
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute left-[4px] top-0 z-10 h-1/2 w-[8px] rounded-bl-[6px] border-b border-l ${ELBOW_BORDER}`}
                      />
                      {i !== lastProjectIndex && (
                        <span
                          aria-hidden
                          className={`pointer-events-none absolute left-[4px] top-1/2 bottom-0 z-10 w-px ${TRUNK_BG}`}
                        />
                      )}
                    </>
                  )}
                  {renderRow(it)}
                </div>
              ) : (
                renderRow(it)
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  // Walk the flat tree, folding each folder header together with the member rows
  // tagged to it (and its empty-folder placeholder) into one folder block; loose
  // top-level rows render on their own.
  const navItems: React.ReactNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "group") {
      const gid = item.group.id;
      const body: TreeItem[] = [];
      let j = i + 1;
      while (j < items.length) {
        const it = items[j];
        const belongs =
          (it.kind === "project" && it.folderId === gid) ||
          (it.kind === "empty" && it.group.id === gid);
        if (!belongs) break;
        body.push(it);
        j++;
      }
      navItems.push(renderFolderBlock(item, body));
      i = j - 1;
    } else {
      navItems.push(renderRow(item));
    }
  }

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
        {selectMode ? (
          navItems
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {navItems}
            </SortableContext>
            <DragOverlay className="pointer-events-none">
              {overlayContent ? (
                <div className="rounded-md bg-[var(--bg-active)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-lg ring-1 ring-[var(--accent-cyan)]/40">
                  {overlayContent}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
        {peerSections.map((section) => (
          <SidebarPeerSection
            key={section.slug}
            slug={section.slug}
            alias={section.alias}
            projects={section.projects}
            selected={selected}
            contextTargetName={contextMenu?.name ?? null}
            onSelect={onSelect}
            onContextMenu={(name, x, y) => setContextMenu({ name, x, y })}
          />
        ))}
      </nav>
      {contextMenu &&
        (selectMode ? (
          <SelectionContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            count={selectedForDelete.size}
            busy={removingNames.size > 0}
            groups={groups}
            anyInGroup={[...selectedForDelete].some((n) => memberOf.has(n))}
            onDelete={() => {
              if (selectedForDelete.size > 0) setConfirmBatch(true);
            }}
            onMoveToGroup={(groupId) => {
              const names = [...selectedForDelete];
              if (names.length > 0) onMoveProjectsToGroup(names, groupId);
              exitSelectMode();
            }}
            onCreateGroupWith={() => {
              setCreateFolder({ initialMembers: [...selectedForDelete] });
              exitSelectMode();
            }}
            onCancel={exitSelectMode}
            onClose={() => setContextMenu(null)}
          />
        ) : (
          <ProjectContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            duplicateDisabled={removingNames.has(contextMenu.name)}
            removeDisabled={
              removingNames.has(contextMenu.name) ||
              duplicatingNames.includes(contextMenu.name)
            }
            isDuplicate={Boolean(contextProject?.parentName)}
            isDetached={detached.has(contextMenu.name)}
            canSelect={projects.length > 1}
            remote={isPeerName(contextMenu.name)}
            sshRemote={contextProject?.isRemote ?? false}
            projectName={contextMenu.name}
            running={contextProject?.running ?? false}
            services={contextProject?.services ?? []}
            projectPath={contextProject?.root ?? null}
            groups={groups}
            currentGroupId={memberOf.get(contextMenu.name) ?? null}
            onRename={() => setRenamingName(contextMenu.name)}
            onBulkDuplicate={() => setBulkDuplicateName(contextMenu.name)}
            onCopyPath={() => {
              // Copy the host-native path; the /@peer-… marker is a routing key,
              // meaningless outside lpm (a no-op strip for local projects).
              if (contextProject?.root) navigator.clipboard.writeText(stripMarker(contextProject.root));
            }}
            onDetach={() => onDetachProject(contextMenu.name)}
            onAttach={() => onAttachProject(contextMenu.name)}
            onSelect={() => enterSelectMode(contextMenu.name)}
            onGitCommit={() => openGitModal("commit")}
            onGitCreatePR={() => openGitModal("pr")}
            onGitSwitchBranch={() => openGitModal("switch")}
            onGitDiscardAll={() => openGitModal("discard")}
            onMoveToGroup={(groupId) => onMoveProjectToGroup(contextMenu.name, groupId)}
            onCreateGroupWith={() => setCreateFolder({ initialMembers: [contextMenu.name] })}
            onRemove={() => setConfirmRemove(contextMenu.name)}
            onRemoveFromDisk={
              contextProject &&
              !contextProject.parentName &&
              !contextProject.isRemote &&
              contextProject.root
                ? () => setConfirmTrash(contextMenu.name)
                : undefined
            }
            onClose={() => setContextMenu(null)}
          />
        ))}
      {groupMenu && (
        <GroupContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          onRename={() => setRenamingGroupId(groupMenu.id)}
          onNewFolder={() => setCreateFolder({})}
          onDelete={() => setDeletingGroupId(groupMenu.id)}
          onClose={() => setGroupMenu(null)}
        />
      )}
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
        open={confirmTrash !== null}
        title="Remove from disk"
        variant="destructive"
        confirmLabel="Remove"
        confirmText={pendingTrashLabel || undefined}
        body={
          <>
            Remove{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {pendingTrashLabel}
            </span>{" "}
            from lpm and move its source folder to the Trash?
            {trashDupCount > 0 && (
              <span className="mt-2 block">
                Its {trashDupCount} duplicate{trashDupPlural}{" "}
                {trashDupCount === 1 ? "is" : "are"} also deleted from disk.
              </span>
            )}
            <span className="mt-2 block">
              You can restore the folder from the Trash
              {trashDupCount > 0 ? "; the duplicates can't be restored." : "."}
            </span>
          </>
        }
        onCancel={() => setConfirmTrash(null)}
        onConfirm={() => {
          if (confirmTrash) onRemoveProjectFromDisk(confirmTrash);
          setConfirmTrash(null);
        }}
      />
      <ConfirmDialog
        open={deletingGroup !== undefined}
        title={deleteFolderTitle}
        variant={groupRemovalCount === 0 ? "default" : "destructive"}
        confirmLabel="Delete folder"
        confirmText={groupConfirmNames.length > 0 ? groupConfirmNames : undefined}
        body={
          groupRemovalCount === 0 ? (
            <>
              Delete the empty folder{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {deletingGroup?.name}
              </span>
              ? Nothing else is removed.
            </>
          ) : (
            <RemovalSummary
              lead={
                <>
                  Deleting the folder{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    {deletingGroup?.name}
                  </span>{" "}
                  also deletes everything inside it:
                </>
              }
              projects={groupRemovalProjects}
              projectByName={projectByName}
            />
          )
        }
        onCancel={() => setDeletingGroupId(null)}
        onConfirm={() => {
          if (deletingGroupId) onDeleteGroup(deletingGroupId);
          setDeletingGroupId(null);
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
          <RemovalSummary
            lead={
              removalProjects.length === 1
                ? "Delete this project?"
                : `Delete these ${removalProjects.length} projects?`
            }
            projects={removalProjects}
            projectByName={projectByName}
          />
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
        project={bulkDuplicateName ? allByName.get(bulkDuplicateName) ?? null : null}
        remote={isPeerName(bulkDuplicateName ?? "")}
        folderNames={groups.map((g) => g.name)}
        onCancel={() => setBulkDuplicateName(null)}
        onConfirm={(count, opts) => {
          if (bulkDuplicateName) onBulkDuplicate(bulkDuplicateName, count, opts);
          setBulkDuplicateName(null);
        }}
      />
      <ProjectRenameModal
        open={renamingName !== null}
        displayName={
          renamingProject ? projectDisplayName(renamingProject, renamingParent) : ""
        }
        currentRoot={renamingProject?.root ?? ""}
        canRenameFolder={
          Boolean(renamingProject) && !renamingProject?.isRemote && !isPeerName(renamingName ?? "")
        }
        folderBusy={Boolean(renamingProject?.running)}
        onClose={() => setRenamingName(null)}
        onRenameLabel={(value) => {
          if (renamingName) onRenameProject(renamingName, value);
        }}
        onMoveFolder={(newRoot) => onMoveProjectRoot(renamingName!, newRoot)}
      />
      <RenameModal
        open={renamingGroupId !== null}
        title="Rename folder"
        initialValue={renamingGroup?.name ?? ""}
        onClose={() => setRenamingGroupId(null)}
        onSubmit={(value) => {
          if (renamingGroupId) onRenameGroup(renamingGroupId, value);
        }}
      />
      <RenameModal
        open={createFolder !== null}
        title="New folder"
        initialValue=""
        onClose={() => setCreateFolder(null)}
        onSubmit={(value) => {
          onCreateGroup(
            value,
            createFolder?.initialMembers ? { initialMembers: createFolder.initialMembers } : undefined,
          );
        }}
      />
      <ProjectGitModals target={gitModal} onClose={() => setGitModal(null)} />

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

      <SidebarAgentToolsPill />

      <div className="flex flex-col p-2">
        <Tooltip
          content="Quick shells for scripts, system commands, and anything not tied to a project."
          side="right"
          wide
          delay={500}
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
          onClick={onStats}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            showStats
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <StatsIcon />
          Stats
        </button>
        <div className="flex items-stretch gap-1">
          <button
            onClick={onSettings}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
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
          <SidebarFooterMore
            showScheduled={showScheduled}
            onScheduled={onScheduled}
            onFeedback={onFeedback}
          />
        </div>
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
