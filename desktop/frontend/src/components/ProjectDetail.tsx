import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { ActionsDnd } from "./ActionsDnd";
import { ActionView } from "./ActionView";
import { ConfigEditor } from "./ConfigEditor";
import { NotesView } from "./NotesView";
import { type TerminalViewHandle } from "./TerminalView";
import { ConfigErrorView } from "./project-detail/ConfigErrorView";
import { Controls } from "./project-detail/Controls";
import { ActionWizard } from "./project-detail/ActionWizard";
import { ActionContextMenu } from "./project-detail/ActionContextMenu";
import { EmptyTerminalState } from "./project-detail/EmptyTerminalState";
import { Header } from "./project-detail/Header";
import { HeaderActions } from "./project-detail/HeaderActions";
import { Modals } from "./project-detail/Modals";
import { ProfileContextMenu } from "./project-detail/ProfileContextMenu";
import { ProfileForm } from "./project-detail/ProfileForm";
import { ServiceContextMenu } from "./project-detail/ServiceContextMenu";
import { ServiceForm } from "./project-detail/ServiceForm";
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
import { getSettings } from "../settings";
import { countPersistedTabs, getProjectTerminals } from "../terminals";
import { useAppStore } from "../store/app";
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
  // ── local UI state ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionInfo | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showTerminalSettings, setShowTerminalSettings] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; action: ActionInfo } | null>(null);
  const [actionToDelete, setActionToDelete] = useState<ActionInfo | null>(null);
  const [deletingAction, setDeletingAction] = useState(false);
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

  const terminalRef = useRef<TerminalViewHandle>(null);

  // ── extracted hooks ─────────────────────────────────────────────────
  const { theme: terminalTheme, setTheme: setTerminalTheme, themeStyle } = useTerminalTheme();
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

  // ── action drag-and-drop ────────────────────────────────────────────
  const reorderActions = useAppStore((s) => s.reorderActions);
  const handleMoveActions = useCallback(
    (next: ActionsLayout) => reorderActions(project.name, next),
    [reorderActions, project.name],
  );
  const renderActionOverlay = useCallback(
    (id: string) => {
      const action = (project.actions ?? []).find((a) => a.name === id);
      if (!action) return null;
      return (
        <ActionView
          action={action}
          compact={isFooterDisplay(action.display)}
          disabled={false}
          onRun={noop}
        />
      );
    },
    [project.actions],
  );

  // ── start/stop/profile/service handlers ─────────────────────────────
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

  const runningServiceNames = useMemo(
    () => (project.running ? new Set(project.services.map((s) => s.name)) : null),
    [project.running, project.services],
  );

  // ── derived layout state ────────────────────────────────────────────
  const showProjectName = getSettings().showProjectName !== false;
  const existingActionKeys = useMemo(
    () => (project.actions ?? []).map((action) => action.name),
    [project.actions],
  );
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

  // ── early return: invalid YAML ──────────────────────────────────────
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

  const handleActionContextMenu = useCallback((e: MouseEvent, action: ActionInfo) => {
    e.preventDefault();
    setActionMenu({ x: e.clientX, y: e.clientY, action });
  }, []);

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

  // ── render ──────────────────────────────────────────────────────────
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
      onEditConfig={() => switchDetailView("config")}
      onOpenNotes={() => switchDetailView("notes")}
      onRestart={() => withLoading(() => onRestart(project.name, activeProfile))}
      onRequestRemove={() => setConfirmRemove(true)}
      onShowTerminalSettings={() => setShowTerminalSettings(true)}
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

  return (
    <ActionsDnd layout={actionsLayout} onMove={handleMoveActions} renderOverlay={renderActionOverlay}>
      <div className="flex h-full flex-col">
        <Header
          projectName={project.name}
          showProjectName={showProjectName}
          sidebarCollapsed={sidebarCollapsed}
          rowRef={headerRowRef}
          innerRef={innerContainerRef}
          actionsWrapped={actionsWrapped}
          actions={headerActionsNode}
          controls={controlsNode}
        />

        {showEmptyState && (
          <EmptyTerminalState
            projectName={project.name}
            onNewTerminal={handleNewTerminal}
            onEditConfig={() => switchDetailView("config")}
          />
        )}

        <TerminalPane
          active={detailView === "terminal" && !showEmptyState}
          visible={visible}
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
            />
          </div>
        )}
        {detailView === "notes" && (
          <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
            <NotesView projectName={project.name} visible={visible && detailView === "notes"} />
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
          terminalSettingsOpen={showTerminalSettings}
          onCloseTerminalSettings={() => setShowTerminalSettings(false)}
          fontSize={fontSize}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          terminalTheme={terminalTheme}
          onTerminalThemeChange={setTerminalTheme}
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

        {actionMenu && (
          <ActionContextMenu
            x={actionMenu.x}
            y={actionMenu.y}
            onEdit={() => setEditingAction(actionMenu.action)}
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
