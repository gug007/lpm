import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { ActionsDnd } from "./ActionsDnd";
import { type ActionGroup, applyMove, groupOf } from "./actionsDndLayout";
import { ActionView } from "./ActionView";
import { ConfigEditor } from "./ConfigEditor";
import { NotesView } from "./NotesView";
import { ProjectAIInstructions } from "./ProjectAIInstructions";
import { type TerminalViewHandle } from "./TerminalView";
import { ConfigErrorView } from "./project-detail/ConfigErrorView";
import { Controls } from "./project-detail/Controls";
import { ActionWizard } from "./project-detail/ActionWizard";
import { ActionContextMenu } from "./project-detail/ActionContextMenu";
import { Header } from "./project-detail/Header";
import { HeaderActions } from "./project-detail/HeaderActions";
import { Modals } from "./project-detail/Modals";
import { ProfileContextMenu } from "./project-detail/ProfileContextMenu";
import { ProfileForm } from "./project-detail/ProfileForm";
import { ServiceContextMenu } from "./project-detail/ServiceContextMenu";
import { ServiceForm } from "./project-detail/ServiceForm";
import { TerminalHistoryModal } from "./project-detail/TerminalHistoryModal";
import { TerminalPane } from "./project-detail/TerminalPane";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { deleteAction } from "../actionConfig";
import { deleteProfile } from "../profileConfig";
import { deleteService } from "../serviceConfig";
import { EMPTY_SERVICES, noop } from "./project-detail/constants";
import { useActionsByDisplay } from "../hooks/useActionsByDisplay";
import { useDetailView } from "../hooks/useDetailView";
import { useEntityEditor } from "../hooks/useEntityEditor";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useOverflowWrap } from "../hooks/useOverflowWrap";
import { usePaneStatus } from "../hooks/usePaneStatus";
import { useProjectActions } from "../hooks/useProjectActions";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { getSettings } from "../store/settings";
import {
  countPersistedTabs,
  getProjectTerminals,
  removeHistoryEntry,
  saveProjectTerminals,
  type PersistedHistoryEntry,
} from "../terminals";
import { useAppStore } from "../store/app";
import { loadLevelMap, levelOf as levelOfMap, type LevelMap } from "../actionLevels";
import { type StructuralOp, structuralSubject } from "../actionsGesture";
import { findActionByPath } from "../actionTree";
import { findParentProject, projectDisplayName } from "./ProjectNameDisplay";
import {
  isFooterDisplay,
  type ActionInfo,
  type ActionsLayout,
  type ProfileInfo,
  type ProjectInfo,
  type ServiceInfo,
} from "../types";

interface ProjectDetailProps {
  project: ProjectInfo;
  visible?: boolean;
  sidebarCollapsed?: boolean;
  onStart: (name: string, profile: string) => Promise<void>;
  onToggleService: (name: string, serviceName: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onRefresh: (newName?: string) => void;
  onRemove: (name: string) => Promise<void>;
}

// A short, readable terminal-tab label from an ad-hoc command (first word,
// e.g. "claude" or "npm").
function spawnCommandLabel(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 24) || "Command";
}

export function ProjectDetail({
  project,
  visible = true,
  sidebarCollapsed = false,
  onStart,
  onToggleService,
  onStop,
  onRestart,
  onRefresh,
  onRemove,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionInfo | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; action: ActionInfo } | null>(null);
  const [actionToDelete, setActionToDelete] = useState<ActionInfo | null>(null);
  const [deletingAction, setDeletingAction] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<PersistedHistoryEntry[]>(
    () => getProjectTerminals(project.name).history ?? [],
  );
  const [showHistory, setShowHistory] = useState(false);
  const profileMenuRef = useOutsideClick<HTMLDivElement>(
    () => setShowProfileMenu(false),
    showProfileMenu,
  );

  const serviceEditor = useEntityEditor<ServiceInfo>({
    projectName: project.name,
    entityLabel: "service",
    deleteFn: deleteService,
    onChanged: onRefresh,
  });
  const profileEditor = useEntityEditor<ProfileInfo>({
    projectName: project.name,
    entityLabel: "profile",
    deleteFn: deleteProfile,
    onChanged: onRefresh,
  });

  const [activeProfile, setActiveProfile] = useState(
    project.activeProfile || project.profiles?.[0]?.name || "",
  );
  useEffect(() => {
    if (project.activeProfile && project.activeProfile !== activeProfile) {
      setActiveProfile(project.activeProfile);
    }
  }, [project.activeProfile, activeProfile]);

  const [terminalCount, setTerminalCount] = useState(() => {
    const saved = getProjectTerminals(project.name);
    return countPersistedTabs(saved.panes) || (saved.terminals?.length ?? 0);
  });

  useEffect(() => {
    setHistoryEntries(getProjectTerminals(project.name).history ?? []);
  }, [project.name, terminalCount]);

  const terminalRef = useRef<TerminalViewHandle>(null);

  const { theme: terminalTheme, themeStyle } = useTerminalTheme();
  const { fontSize, zoomIn, zoomOut } = useTerminalFontSize();
  const paneStatus = usePaneStatus(project.statusEntries);
  const { headerActions, footerActions, menuActions, headerIds, footerIds, layout: actionsLayout } =
    useActionsByDisplay(project.actions);

  const { detailView, switchDetailView } = useDetailView({
    projectName: project.name,
    visible,
  });

  const handleNewTerminal = useCallback(() => {
    switchDetailView("terminal");
    terminalRef.current?.createTerminal();
  }, [switchDetailView]);
  useKeyboardShortcut({ key: "t", meta: true }, handleNewTerminal, visible);

  const projectActions = useProjectActions({
    projectName: project.name,
    terminalViewRef: terminalRef,
    onSwitchToTerminal: () => switchDetailView("terminal"),
    onCloseRunning: () => setShowQuickMenu(false),
  });
  const { runningAction, handleRunAction, modals: actionModals } = projectActions;

  // "Bulk Duplicate" queues tasks (actions or ad-hoc commands) to run on each
  // fresh copy; this detail stays mounted (App keeps every visited project
  // alive) even while hidden, so the tasks launch in the background. Fire once
  // per mount.
  const spawnTasks = useAppStore((s) => s.spawnTasks[project.name]);
  const consumeSpawnTasks = useAppStore((s) => s.consumeSpawnTasks);
  const spawnConsumed = useRef(false);
  useEffect(() => {
    if (spawnConsumed.current || !spawnTasks?.length) return;
    const actions = project.actions ?? [];
    const needsActions = spawnTasks.some((t) => t.kind === "action");
    if (needsActions && actions.length === 0) return;
    spawnConsumed.current = true;
    consumeSpawnTasks(project.name);
    for (const task of spawnTasks) {
      if (task.kind === "command") {
        switchDetailView("terminal");
        terminalRef.current?.createTerminalWithCmd(
          spawnCommandLabel(task.command),
          task.command,
          { prompt: task.prompt },
        );
      } else {
        const action = findActionByPath(actions, task.actionName);
        if (action) handleRunAction(action, { prompt: task.prompt });
      }
    }
  }, [spawnTasks, project.actions, project.name, consumeSpawnTasks, handleRunAction, switchDetailView]);

  const parentProject = useAppStore((s) => findParentProject(project, s.projects));
  const displayName = projectDisplayName(project, parentProject);

  const reorderActions = useAppStore((s) => s.reorderActions);
  const previewReorderActions = useAppStore((s) => s.previewReorderActions);
  const handleMoveActions = useCallback(
    (next: ActionsLayout) => reorderActions(project.name, next),
    [reorderActions, project.name],
  );
  const handlePreviewActions = useCallback(
    (next: ActionsLayout) => previewReorderActions(project.name, next),
    [previewReorderActions, project.name],
  );
  // Ref-tracked actions so the overlay renderer stays stable across
  // every preview re-render — dnd-kit holds the renderOverlay reference
  // for the duration of the drag, so a fresh function each frame would
  // cause needless DragOverlay reconciliation.
  const actionsRef = useRef(project.actions);
  actionsRef.current = project.actions;
  const renderActionOverlay = useCallback(
    (id: string, overGroup: ActionGroup | null) => {
      const all = actionsRef.current ?? [];
      const action = findActionByPath(all, id);
      if (!action) return null;
      // Mirror the destination form factor while hovering, so the user
      // sees how the action will look in the zone they're aiming for —
      // not the zone they came from.
      const compact = overGroup ? overGroup === "footer" : isFooterDisplay(action.display);
      return (
        <ActionView
          action={action}
          compact={compact}
          disabled={false}
          onRun={noop}
        />
      );
    },
    [],
  );

  const levelMapRef = useRef<LevelMap>(new Map());
  useEffect(() => {
    // Hidden instances stay mounted (App keeps every visited project's
    // detail alive); skipping them avoids re-reading all three config
    // layers per project on every refresh.
    if (!visible) return;
    let cancelled = false;
    loadLevelMap(project.name).then((m) => {
      if (!cancelled) levelMapRef.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, [project.name, project.actions, visible]);

  const levelOf = useCallback((id: string) => levelOfMap(levelMapRef.current, id), []);
  const canNest = useCallback(
    (activeId: string, targetId: string) => {
      const level = levelOf(activeId);
      return level !== null && level === levelOf(targetId);
    },
    [levelOf],
  );
  const isMenu = useCallback(
    (id: string) => !!(actionsRef.current ?? []).find((a) => a.name === id)?.children?.length,
    [],
  );
  const applyStructuralOp = useAppStore((s) => s.applyStructuralOp);
  const handleStructural = useCallback(
    (op: StructuralOp) => {
      const level = levelOf(structuralSubject(op));
      if (!level) return;
      applyStructuralOp(project.name, op, level);
    },
    [applyStructuralOp, project.name, levelOf],
  );

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };
  // Start/stop/service actions all snap back to the terminal so the
  // user lands where the new state will be visible. Restart, in
  // contrast, runs through plain withLoading because it doesn't change
  // which detail view makes sense.
  const runAndShowTerminal = (fn: () => Promise<void>) =>
    withLoading(async () => {
      await fn();
      switchDetailView("terminal");
    });

  const handleStart = () => runAndShowTerminal(() => onStart(project.name, activeProfile));
  const handleStop = () => runAndShowTerminal(() => onStop(project.name));
  const handleToggleServiceClick = (serviceName: string) =>
    runAndShowTerminal(() => onToggleService(project.name, serviceName));
  const handlePickProfile = (profile: string) => {
    setActiveProfile(profile);
    setShowProfileMenu(false);
    runAndShowTerminal(() => onStart(project.name, profile));
  };

  const handleOpenHistory = useCallback(() => {
    setShowHistory(true);
  }, []);

  const handleResumeFromHistory = useCallback(
    (entry: PersistedHistoryEntry) => {
      setShowHistory(false);
      switchDetailView("terminal");
      terminalRef.current?.resumeFromHistory(entry);
    },
    [switchDetailView],
  );

  const handleForgetHistory = useCallback(
    async (entry: PersistedHistoryEntry) => {
      const next = removeHistoryEntry(
        getProjectTerminals(project.name),
        entry.resumeCmd,
      );
      await saveProjectTerminals(project.name, next);
      setHistoryEntries(next.history ?? []);
    },
    [project.name],
  );

  const runningServiceNames = useMemo(
    () => (project.running ? new Set(project.services.map((s) => s.name)) : null),
    [project.running, project.services],
  );

  const showProjectName = getSettings().showProjectName !== false;
  const existingActionKeys = useMemo(
    () => (project.actions ?? []).map((action) => action.name),
    [project.actions],
  );

  // An external config edit can delete the action while its menu is
  // open; acting on the vanished name would persist a ghost entry.
  useEffect(() => {
    if (actionMenu && !existingActionKeys.includes(actionMenu.action.name)) setActionMenu(null);
  }, [actionMenu, existingActionKeys]);
  const nextHeaderActionPosition =
    headerActions.reduce((max, action, index) => Math.max(max, action.position ?? index + 1), 0) + 1;
  const showEmptyState = !project.running && detailView === "terminal" && terminalCount === 0;

  const {
    wrapped: actionsWrapped,
    rowRef: headerRowRef,
    innerRef: innerContainerRef,
  } = useOverflowWrap([
    headerActions.length,
    showProjectName,
    project.running,
    project.allServices.length,
  ]);

  const handleActionContextMenu = useCallback((e: MouseEvent, action: ActionInfo) => {
    e.preventDefault();
    setActionMenu({ x: e.clientX, y: e.clientY, action });
  }, []);

  // A null group means an external edit moved the action mid-menu; both
  // destinations stay enabled so it can still be placed.
  const actionMenuMove = useMemo(() => {
    if (!actionMenu) return null;
    const name = actionMenu.action.name;
    const group = groupOf(actionsLayout, name);
    const row: string[] = group ? actionsLayout[group] : [];
    const idx = row.indexOf(name);
    return {
      group,
      canMoveLeft: idx > 0,
      canMoveRight: idx !== -1 && idx < row.length - 1,
      toGroup: (target: ActionGroup) => {
        const next = applyMove(actionsLayout, name, {
          group: target,
          index: actionsLayout[target].length,
        });
        reorderActions(project.name, next);
        if (target === "footer" && detailView !== "terminal") toast("Moved to footer");
      },
      left: () => {
        if (group) reorderActions(project.name, applyMove(actionsLayout, name, { group, index: idx - 1 }));
      },
      right: () => {
        if (group) reorderActions(project.name, applyMove(actionsLayout, name, { group, index: idx + 1 }));
      },
    };
  }, [actionMenu, actionsLayout, reorderActions, project.name, detailView]);

  const handleConfirmDeleteAction = async () => {
    if (!actionToDelete) return;
    setDeletingAction(true);
    try {
      await deleteAction(project.name, actionToDelete.name);
      toast.success(`Deleted ${actionToDelete.label || actionToDelete.name}`);
      setActionToDelete(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete action");
    } finally {
      setDeletingAction(false);
    }
  };

  const headerActionsNode = (
    <HeaderActions
      actions={headerActions}
      ids={headerIds}
      wrapped={actionsWrapped}
      disabled={runningAction !== null}
      onRun={handleRunAction}
      onContextMenu={handleActionContextMenu}
      onAddAction={() => setShowCreateAction(true)}
    />
  );

  const controlsNode = (
    <Controls
      project={project}
      loading={loading}
      activeProfile={activeProfile}
      menuActions={menuActions}
      runningAction={runningAction}
      runningServiceNames={runningServiceNames}
      showQuickMenu={showQuickMenu}
      showProfileMenu={showProfileMenu}
      profileMenuRef={profileMenuRef}
      hasHistory={historyEntries.length > 0}
      onToggleQuickMenu={() => {
        setShowProfileMenu(false);
        setShowQuickMenu((v) => !v);
      }}
      onCloseQuickMenu={() => setShowQuickMenu(false)}
      onToggleProfileMenu={() => {
        setShowQuickMenu(false);
        setShowProfileMenu((v) => !v);
      }}
      onStart={handleStart}
      onStop={handleStop}
      onPickProfile={handlePickProfile}
      onToggleService={handleToggleServiceClick}
      onRunAction={handleRunAction}
      onOpenHistory={handleOpenHistory}
      onEditConfig={() => switchDetailView("config")}
      onOpenNotes={() => switchDetailView("notes")}
      onOpenAI={() => switchDetailView("ai")}
      onRestart={() => withLoading(() => onRestart(project.name, activeProfile))}
      onRequestRemove={() => setConfirmRemove(true)}
      onAddService={() => {
        setShowProfileMenu(false);
        serviceEditor.startCreate();
      }}
      onAddProfile={() => {
        setShowProfileMenu(false);
        profileEditor.startCreate();
      }}
      onEditService={(service) => {
        setShowProfileMenu(false);
        serviceEditor.startEdit(service);
      }}
      onEditProfile={(profile) => {
        setShowProfileMenu(false);
        profileEditor.startEdit(profile);
      }}
      onContextMenuService={serviceEditor.showContextMenu}
      onContextMenuProfile={profileEditor.showContextMenu}
    />
  );

  // Rules of Hooks: the configError branch must come after every hook so
  // a project flipping between error and ok renders the same hook count.
  if (project.configError) {
    return (
      <ConfigErrorView
        projectName={project.name}
        error={project.configError}
        showProjectName={showProjectName}
        sidebarCollapsed={sidebarCollapsed}
        showConfigEditor={detailView === "config"}
        onShowConfigEditor={() => switchDetailView("config")}
        onCloseConfigEditor={() => switchDetailView("terminal")}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <ActionsDnd
      layout={actionsLayout}
      onMove={handleMoveActions}
      onPreview={handlePreviewActions}
      onStructural={handleStructural}
      canNest={canNest}
      isMenu={isMenu}
      renderOverlay={renderActionOverlay}
    >
      <div className="flex h-full flex-col">
        <Header
          projectName={displayName}
          showProjectName={showProjectName}
          sidebarCollapsed={sidebarCollapsed}
          rowRef={headerRowRef}
          innerRef={innerContainerRef}
          actionsWrapped={actionsWrapped}
          actions={headerActionsNode}
          controls={controlsNode}
        />

        <TerminalPane
          active={detailView === "terminal"}
          visible={visible}
          showEmptyState={showEmptyState}
          onNewTerminal={handleNewTerminal}
          onEditConfig={() => switchDetailView("config")}
          themeStyle={themeStyle}
          terminalRef={terminalRef}
          projectName={project.name}
          projectRoot={project.root}
          services={project.running ? project.services : EMPTY_SERVICES}
          terminalTheme={terminalTheme}
          fontSize={fontSize}
          paneStatus={paneStatus}
          footerActions={footerActions}
          footerIds={footerIds}
          disabled={runningAction !== null}
          onTerminalCountChange={setTerminalCount}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onRunAction={handleRunAction}
          onActionContextMenu={handleActionContextMenu}
        />

        {detailView === "config" && (
          <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
            <ConfigEditor
              projectName={project.name}
              onSaved={onRefresh}
              onBack={() => switchDetailView("terminal")}
              onToggleView={() => switchDetailView("terminal")}
              isRemote={project.isRemote}
            />
          </div>
        )}
        {detailView === "notes" && (
          <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
            <NotesView projectName={project.name} visible={visible && detailView === "notes"} />
          </div>
        )}
        {detailView === "ai" && (
          <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProjectAIInstructions
              projectName={project.name}
              onBack={() => switchDetailView("terminal")}
            />
          </div>
        )}

        <Modals
          projectName={project.name}
          actionModals={actionModals}
          confirmRemoveOpen={confirmRemove}
          removeBusy={loading}
          onCancelRemove={() => setConfirmRemove(false)}
          onConfirmRemove={async () => {
            await onRemove(project.name);
            setConfirmRemove(false);
          }}
        />

        <ActionWizard
          open={showCreateAction || editingAction !== null}
          projectName={project.name}
          existingActionKeys={existingActionKeys}
          nextPosition={nextHeaderActionPosition}
          editing={editingAction}
          onClose={() => {
            setShowCreateAction(false);
            setEditingAction(null);
          }}
          onSaved={() => onRefresh()}
        />

        {showHistory && (
          <TerminalHistoryModal
            entries={historyEntries}
            onResume={handleResumeFromHistory}
            onForget={handleForgetHistory}
            onClose={() => setShowHistory(false)}
          />
        )}

        {actionMenu && actionMenuMove && (
          <ActionContextMenu
            x={actionMenu.x}
            y={actionMenu.y}
            currentGroup={actionMenuMove.group}
            canMoveLeft={actionMenuMove.canMoveLeft}
            canMoveRight={actionMenuMove.canMoveRight}
            onMoveTo={actionMenuMove.toGroup}
            onMoveLeft={actionMenuMove.left}
            onMoveRight={actionMenuMove.right}
            onEdit={() => setEditingAction(actionMenu.action)}
            canUngroup={!!actionMenu.action.children?.length}
            onUngroup={() => handleStructural({ kind: "ungroup", path: actionMenu.action.name })}
            onDelete={() => setActionToDelete(actionMenu.action)}
            onClose={() => setActionMenu(null)}
          />
        )}

        <ConfirmDialog
          open={actionToDelete !== null}
          title="Delete action?"
          body={
            <>
              Remove <span className="font-medium text-[var(--text-primary)]">{actionToDelete?.label || actionToDelete?.name}</span> from this project's config. This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          variant="destructive"
          disabled={deletingAction}
          onCancel={() => setActionToDelete(null)}
          onConfirm={handleConfirmDeleteAction}
        />

        <ServiceForm
          open={serviceEditor.formOpen}
          projectName={project.name}
          services={project.allServices}
          profiles={project.profiles}
          editing={serviceEditor.editing}
          onClose={serviceEditor.closeForm}
          onSaved={onRefresh}
          onDelete={
            serviceEditor.editing && project.allServices.length > 1
              ? serviceEditor.requestDelete
              : undefined
          }
          onPickService={serviceEditor.startEdit}
          onPickProfile={(profile) => {
            serviceEditor.closeForm();
            profileEditor.startEdit(profile);
          }}
        />

        {serviceEditor.contextMenu && (
          <ServiceContextMenu
            x={serviceEditor.contextMenu.x}
            y={serviceEditor.contextMenu.y}
            onEdit={serviceEditor.editFromContextMenu}
            onDelete={serviceEditor.deleteFromContextMenu}
            onClose={serviceEditor.closeContextMenu}
          />
        )}

        <ConfirmDialog
          open={serviceEditor.toDelete !== null}
          title="Delete service?"
          body={
            <>
              Remove{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {serviceEditor.toDelete?.name}
              </span>{" "}
              from this project's config. Any profile that referenced it will be updated.
            </>
          }
          confirmLabel="Delete"
          variant="destructive"
          disabled={serviceEditor.deleting}
          onCancel={serviceEditor.cancelDelete}
          onConfirm={serviceEditor.confirmDelete}
        />

        <ProfileForm
          open={profileEditor.formOpen}
          projectName={project.name}
          services={project.allServices}
          profiles={project.profiles}
          editing={profileEditor.editing}
          onClose={profileEditor.closeForm}
          onSaved={onRefresh}
          onDelete={profileEditor.editing ? profileEditor.requestDelete : undefined}
          onPickService={(service) => {
            profileEditor.closeForm();
            serviceEditor.startEdit(service);
          }}
          onPickProfile={profileEditor.startEdit}
        />

        {profileEditor.contextMenu && (
          <ProfileContextMenu
            x={profileEditor.contextMenu.x}
            y={profileEditor.contextMenu.y}
            onEdit={profileEditor.editFromContextMenu}
            onDelete={profileEditor.deleteFromContextMenu}
            onClose={profileEditor.closeContextMenu}
          />
        )}

        <ConfirmDialog
          open={profileEditor.toDelete !== null}
          title="Delete profile?"
          body={
            <>
              Remove{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {profileEditor.toDelete?.name}
              </span>{" "}
              from this project's config. The services it bundled stay.
            </>
          }
          confirmLabel="Delete"
          variant="destructive"
          disabled={profileEditor.deleting}
          onCancel={profileEditor.cancelDelete}
          onConfirm={profileEditor.confirmDelete}
        />
      </div>
    </ActionsDnd>
  );
}
